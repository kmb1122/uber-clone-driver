import * as Location from "expo-location";
import { Redirect, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DriverMap from "@/components/DriverMap";
import { useAuth } from "@/contexts/AuthContext";
import { fetchNearbySearchingRides, type NearbyRide } from "@/lib/rideOffers";
import { supabase } from "@/lib/supabase";

const SHEET_HEIGHT = 286;
const SHEET_COLLAPSED_HEIGHT = 58;
const SHEET_DRAG_DISTANCE = SHEET_HEIGHT - SHEET_COLLAPSED_HEIGHT;

type Coordinate = { latitude: number; longitude: number };

export default function DashboardScreen() {
  const { loading, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const coordinateRef = useRef<Coordinate | null>(null);
  const [nearbyRides, setNearbyRides] = useState<NearbyRide[]>([]);
  const [dismissedRideId, setDismissedRideId] = useState<string | null>(null);
  const [centerRequest, setCenterRequest] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<"trips" | "insights" | null>(
    null,
  );
  const [sheetOffset] = useState(() => new Animated.Value(SHEET_DRAG_DISTANCE));

  useEffect(() => {
    if (!user) return;

    let active = true;
    const loadDriverStatus = async () => {
      setStatusLoading(true);
      const { data, error } = await supabase
        .from("drivers")
        .select("is_available, lat, lng")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        Alert.alert("Unable to load driver status", error.message);
      } else {
        setIsOnline(data?.is_available ?? false);
        if (data?.lat != null && data.lng != null) {
          setCoordinate({ latitude: data.lat, longitude: data.lng });
        }
        setStatusLoaded(true);
      }
      setStatusLoading(false);
    };

    void loadDriverStatus();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadDriverStatus();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [user]);

  useEffect(() => {
    coordinateRef.current = coordinate;
  }, [coordinate]);

  const hasCoordinate = coordinate !== null;
  useEffect(() => {
    if (!isOnline || !hasCoordinate) return;

    let active = true;
    const refreshRideOffers = async () => {
      const currentCoordinate = coordinateRef.current;
      if (!currentCoordinate) return;

      try {
        const offers = await fetchNearbySearchingRides(currentCoordinate);
        if (active) setNearbyRides(offers);
      } catch (error) {
        if (active) {
          console.error("Unable to fetch nearby ride offers", error);
          setNearbyRides([]);
        }
      }
    };

    void refreshRideOffers();
    const rideChanges = supabase
      .channel("driver-ride-offers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        () => void refreshRideOffers(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[ride-offers] Listening for rides table changes.");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Ride realtime subscription status:", status);
        }
      });
    const interval = setInterval(() => void refreshRideOffers(), 15_000);
    return () => {
      active = false;
      clearInterval(interval);
      void supabase.removeChannel(rideChanges);
    };
  }, [hasCoordinate, isOnline]);

  const setExpanded = useCallback(
    (expanded: boolean) => {
      if (expanded && !isOnline) return;
      setSheetExpanded(expanded);
      Animated.spring(sheetOffset, {
        toValue: expanded ? 0 : SHEET_DRAG_DISTANCE,
        useNativeDriver: true,
        damping: 26,
        stiffness: 220,
        mass: 0.8,
      }).start();
    },
    [isOnline, sheetOffset],
  );

  const toggleOnline = async () => {
    if (!user || !statusLoaded || statusLoading || savingStatus) return;

    const nextOnlineState = !isOnline;
    setSavingStatus(true);

    try {
      let currentCoordinate = coordinate;
      if (nextOnlineState && !currentCoordinate) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Location permission is needed to go online.");
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        currentCoordinate = {
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
        };
        setCoordinate(currentCoordinate);
      }

      const statusUpdate = nextOnlineState
        ? supabase.from("drivers").upsert(
            {
              user_id: user.id,
              lat: currentCoordinate!.latitude,
              lng: currentCoordinate!.longitude,
              is_available: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          )
        : supabase
            .from("drivers")
            .update({
              is_available: false,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);
      const { error } = await statusUpdate;

      if (error) throw error;

      setIsOnline(nextOnlineState);
      if (!nextOnlineState) setExpanded(false);
    } catch (error) {
      Alert.alert(
        "Unable to update driver status",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSavingStatus(false);
    }
  };

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          isOnline && Math.abs(gesture.dy) > 5,
        onPanResponderMove: (_, gesture) => {
          if (!isOnline) return;
          const startOffset = sheetExpanded ? 0 : SHEET_DRAG_DISTANCE;
          const nextOffset = Math.max(
            0,
            Math.min(SHEET_DRAG_DISTANCE, startOffset + gesture.dy),
          );
          sheetOffset.setValue(nextOffset);
        },
        onPanResponderRelease: (_, gesture) => {
          if (!isOnline) {
            setExpanded(false);
            return;
          }
          const shouldExpand = sheetExpanded
            ? gesture.dy < SHEET_DRAG_DISTANCE / 3
            : gesture.dy < -SHEET_DRAG_DISTANCE / 3;
          setExpanded(shouldExpand);
        },
        onPanResponderTerminate: () => setExpanded(sheetExpanded),
      }),
    [isOnline, setExpanded, sheetExpanded, sheetOffset],
  );

  useEffect(() => {
    if (!sheetExpanded) sheetOffset.setValue(SHEET_DRAG_DISTANCE);
  }, [sheetExpanded, sheetOffset]);

  if (loading) return null;
  if (!user) return <Redirect href="/login" />;

  const collapsedBottom = SHEET_COLLAPSED_HEIGHT + insets.bottom;
  const rideOffer =
    isOnline && hasCoordinate
      ? nearbyRides.find((ride) => ride.id !== dismissedRideId)
      : undefined;
  const fareValue = rideOffer ? Number(rideOffer.fare) : Number.NaN;
  const fareLabel = rideOffer
    ? Number.isFinite(fareValue)
      ? `$${fareValue.toFixed(2)}`
      : rideOffer.fare
    : "";

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />
      <DriverMap
        centerRequest={centerRequest}
        onCoordinateChange={setCoordinate}
      />

      <View style={[styles.header, { top: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="Open account"
          accessibilityRole="button"
          onPress={() => router.push("/account")}
          style={styles.iconButton}
        >
          <SymbolView
            name={{ ios: "line.3.horizontal", android: "menu", web: "menu" }}
            size={23}
            tintColor="#151719"
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Center map on my location"
          accessibilityRole="button"
          onPress={() => setCenterRequest((request) => request + 1)}
          style={[styles.locationControl, { bottom: collapsedBottom + 172 }]}
        >
          <View style={styles.targetIcon}>
            <View style={styles.targetRing} />
            <View style={styles.targetHorizontal} />
            <View style={styles.targetVertical} />
            <View style={styles.targetCenter} />
          </View>
        </Pressable>

        <Pressable
          accessibilityLabel="Today's earnings, 93 dollars and 66 cents"
          accessibilityRole="button"
          onPress={() =>
            setActiveTool(activeTool === "insights" ? null : "insights")
          }
          style={styles.earningsPill}
        >
          <View style={styles.earningsDot} />
          <Text style={styles.earningsText}>$93.66</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={searchOpen ? "Close map search" : "Search map"}
          accessibilityRole="button"
          onPress={() => setSearchOpen((open) => !open)}
          style={styles.iconButton}
        >
          <SymbolView
            name={{ ios: "magnifyingglass", android: "search", web: "search" }}
            size={21}
            tintColor="#151719"
          />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={[styles.searchPopover, { top: insets.top + 66 }]}>
          <SymbolView
            name={{ ios: "magnifyingglass", android: "search", web: "search" }}
            size={18}
            tintColor="#7A8085"
          />
          <Text style={styles.searchText}>Search this area</Text>
        </View>
      )}

      <View style={styles.rightControls}>
        <MapControl
          label="Center map on my position"
          target
          active={false}
          onPress={() => setCenterRequest((request) => request + 1)}
        />
        <MapControl
          label="Driving insights"
          symbol={{
            ios: "chart.bar.fill",
            android: "bar_chart",
            web: "bar_chart",
          }}
          active={activeTool === "insights"}
          onPress={() =>
            setActiveTool(activeTool === "insights" ? null : "insights")
          }
        />
      </View>

      {activeTool && (
        <View style={styles.toolPopover}>
          <Text style={styles.toolPopoverTitle}>
            {activeTool === "trips" ? "Trip requests" : "Today's earnings"}
          </Text>
          <Text style={styles.toolPopoverBody}>
            {activeTool === "trips"
              ? "No requests nearby"
              : "$93.66 earned today"}
          </Text>
        </View>
      )}

      {rideOffer && (
        <View
          accessibilityLabel="New UberX ride offer"
          style={[styles.rideOffer, { bottom: collapsedBottom + 12 }]}
        >
          <View style={styles.offerHeader}>
            <View style={styles.offerType}>
              <Text style={styles.offerTypeText}>UberX</Text>
            </View>
            <Text style={styles.exclusiveTag}>Exclusive</Text>
            <Pressable
              accessibilityLabel="Dismiss ride offer"
              accessibilityRole="button"
              onPress={() => setDismissedRideId(rideOffer.id)}
              style={styles.dismissButton}
            >
              <SymbolView
                name={{ ios: "xmark", android: "close", web: "close" }}
                size={15}
                tintColor="#555D62"
              />
            </Pressable>
          </View>

          <Text style={styles.offerFare}>{fareLabel}</Text>

          {rideOffer.rating && (
            <View style={styles.offerRating}>
              <SymbolView
                name={{ ios: "star.fill", android: "star", web: "star" }}
                size={12}
                tintColor="#1C2225"
              />
              <Text style={styles.offerRatingText}>{rideOffer.rating}</Text>
            </View>
          )}

          <View style={styles.offerRoute}>
            <View style={styles.routeRail}>
              <View style={styles.pickupDot} />
              <View style={styles.routeLine} />
              <View style={styles.dropoffDot} />
            </View>
            <View style={styles.routeStops}>
              <View style={styles.routeStop}>
                <Text style={styles.routeMeta}>
                  {rideOffer.durationSeconds != null
                    ? `${Math.max(1, Math.round(rideOffer.durationSeconds / 60))} MIN · `
                    : ""}
                  {(rideOffer.distanceMeters / 1000).toFixed(1)} KM AWAY
                </Text>
                <Text numberOfLines={1} style={styles.routeAddress}>
                  {rideOffer.pickupAddress}
                </Text>
              </View>
              <View style={styles.routeStop}>
                <Text style={styles.routeMeta}>DROP-OFF</Text>
                <Text numberOfLines={1} style={styles.routeAddress}>
                  {rideOffer.dropoffAddress}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityLabel={`Accept ride offer for ${fareLabel}`}
            accessibilityRole="button"
            onPress={() => setDismissedRideId(rideOffer.id)}
            style={({ pressed }) => [
              styles.acceptButton,
              pressed && styles.acceptButtonPressed,
            ]}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </Pressable>
        </View>
      )}

      {!isOnline && (
        <Pressable
          accessibilityLabel="Go online"
          accessibilityRole="button"
          accessibilityState={{
            disabled: savingStatus || statusLoading || !statusLoaded,
          }}
          disabled={savingStatus || statusLoading || !statusLoaded}
          onPress={toggleOnline}
          style={({ pressed }) => [
            styles.goButton,
            { bottom: collapsedBottom + 17 },
            pressed && styles.goButtonPressed,
          ]}
        >
          <Text style={styles.goButtonText}>
            {savingStatus || statusLoading || !statusLoaded ? "..." : "GO"}
          </Text>
        </Pressable>
      )}

      <Animated.View
        {...sheetPanResponder.panHandlers}
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            transform: [{ translateY: sheetOffset }],
          },
        ]}
      >
        <Pressable
          accessibilityLabel={
            sheetExpanded ? "Collapse status panel" : "Expand status panel"
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !isOnline }}
          disabled={!isOnline}
          onPress={() => setExpanded(!sheetExpanded)}
          style={styles.sheetHandleArea}
        >
          <View style={styles.handle} />
        </Pressable>
        <View style={styles.sheetRow}>
          <Pressable
            accessibilityLabel="Driving preferences"
            accessibilityRole="button"
            accessibilityState={{ disabled: !isOnline }}
            disabled={!isOnline}
            onPress={() => setExpanded(true)}
            style={styles.sheetSideButton}
          >
            <SymbolView
              name={{
                ios: "slider.horizontal.3",
                android: "tune",
                web: "tune",
              }}
              size={20}
              tintColor="#202426"
            />
          </Pressable>
          <Pressable
            accessibilityState={{ disabled: !isOnline }}
            accessibilityRole="button"
            disabled={!isOnline}
            onPress={() => setExpanded(!sheetExpanded)}
            style={styles.statusTitleButton}
          >
            <Text style={styles.statusTitle}>
              {isOnline ? "You're online" : "You're offline"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Expand status details"
            accessibilityRole="button"
            accessibilityState={{ disabled: !isOnline }}
            disabled={!isOnline}
            onPress={() => setExpanded(!sheetExpanded)}
            style={styles.sheetSideButton}
          >
            <SymbolView
              name={{
                ios: "list.bullet",
                android: "format_list_bulleted",
                web: "format_list_bulleted",
              }}
              size={20}
              tintColor="#202426"
            />
          </Pressable>
        </View>
        <View style={styles.sheetDetails}>
          <View style={styles.detailDivider} />
          <View style={styles.detailsHeading}>
            <View
              style={[
                styles.statusIndicator,
                isOnline && styles.statusIndicatorOnline,
              ]}
            />
            <Text style={styles.detailsTitle}>
              {isOnline ? "Available for trips" : "Driver status"}
            </Text>
          </View>
          <Text style={styles.detailsCopy}>
            {isOnline
              ? "You're ready to receive trip requests."
              : "You're not receiving trip requests right now."}
          </Text>
          <Pressable
            accessibilityLabel={isOnline ? "Go offline" : "Go online"}
            accessibilityRole="button"
            accessibilityState={{
              disabled: savingStatus || statusLoading || !statusLoaded,
            }}
            disabled={savingStatus || statusLoading || !statusLoaded}
            onPress={toggleOnline}
            style={[
              styles.detailsAction,
              isOnline && styles.detailsActionOnline,
            ]}
          >
            <Text style={styles.detailsActionText}>
              {isOnline ? "STOP" : "Go online"}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

type MapControlProps = {
  label: string;
  symbol?: ComponentProps<typeof SymbolView>["name"];
  target?: boolean;
  active: boolean;
  onPress: () => void;
};

function MapControl({
  label,
  symbol,
  target = false,
  active,
  onPress,
}: MapControlProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.mapControl, active && styles.mapControlActive]}
    >
      {target ? (
        <View style={styles.targetIcon}>
          <View style={styles.targetRing} />
          <View style={styles.targetHorizontal} />
          <View style={styles.targetVertical} />
          <View style={styles.targetCenter} />
        </View>
      ) : symbol ? (
        <SymbolView
          name={symbol}
          size={19}
          tintColor={active ? "#2473D5" : "#202426"}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#E9EDF0" },
  header: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    elevation: 3,
    shadowColor: "#111111",
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  notificationBadge: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 21,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 9,
    backgroundColor: "#2779D8",
  },
  notificationText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  earningsPill: {
    minWidth: 92,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: "#121517",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    elevation: 4,
  },
  earningsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#59CA8A",
  },
  earningsText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  searchPopover: {
    position: "absolute",
    right: 12,
    zIndex: 6,
    width: 205,
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    elevation: 4,
  },
  searchText: { color: "#7A8085", fontSize: 14 },
  rightControls: {
    position: "absolute",
    top: "41%",
    right: 12,
    zIndex: 4,
    gap: 9,
  },
  mapControl: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    elevation: 3,
    shadowColor: "#101314",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  mapControlActive: { borderWidth: 1, borderColor: "#8DBAF1" },
  locationControl: {
    position: "absolute",
    left: 12,
    zIndex: 4,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    elevation: 3,
  },
  targetIcon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  targetRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: "#202426",
    borderRadius: 8,
  },
  targetHorizontal: {
    position: "absolute",
    width: 22,
    height: 2,
    backgroundColor: "#202426",
  },
  targetVertical: {
    position: "absolute",
    width: 2,
    height: 22,
    backgroundColor: "#202426",
  },
  targetCenter: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#202426",
  },
  toolPopover: {
    position: "absolute",
    right: 60,
    top: "43%",
    zIndex: 6,
    minWidth: 165,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    elevation: 4,
  },
  toolPopoverTitle: { color: "#181B1D", fontSize: 14, fontWeight: "700" },
  toolPopoverBody: { color: "#6F777C", fontSize: 12, marginTop: 4 },
  rideOffer: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#D6DCE1",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    elevation: 12,
    shadowColor: "#101314",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  offerHeader: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offerType: {
    height: 21,
    paddingHorizontal: 7,
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: "#171A1C",
  },
  offerTypeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  exclusiveTag: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#EEF5FC",
    color: "#326FAE",
    fontSize: 11,
    fontWeight: "600",
  },
  dismissButton: {
    width: 28,
    height: 28,
    marginLeft: "auto",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#F3F4F5",
  },
  offerFare: {
    marginTop: 2,
    color: "#111516",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
  },
  offerRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  offerRatingText: { color: "#31383C", fontSize: 11, fontWeight: "600" },
  offerRoute: {
    minHeight: 62,
    marginTop: 9,
    marginBottom: 9,
    flexDirection: "row",
  },
  routeRail: {
    width: 17,
    alignItems: "center",
    paddingTop: 3,
    paddingBottom: 8,
  },
  pickupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1C2428",
  },
  routeLine: {
    flex: 1,
    marginVertical: 2,
    borderLeftWidth: 1,
    borderStyle: "dashed",
    borderColor: "#A8B0B5",
  },
  dropoffDot: {
    width: 6,
    height: 6,
    borderWidth: 1.5,
    borderColor: "#1C2428",
    backgroundColor: "#FFFFFF",
  },
  routeStops: { flex: 1, justifyContent: "space-between" },
  routeStop: { minHeight: 27, justifyContent: "center" },
  routeMeta: {
    color: "#646D72",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
  },
  routeAddress: {
    color: "#252B2E",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
  },
  acceptButton: {
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "#2879E5",
  },
  acceptButtonPressed: { backgroundColor: "#1F66C5" },
  acceptButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  goButton: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 4,
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#2879E5",
    elevation: 5,
    shadowColor: "#101314",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  goButtonPressed: { transform: [{ scale: 0.96 }] },
  goButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    elevation: 12,
    shadowColor: "#101314",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  sheetHandleArea: {
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: { width: 35, height: 4, borderRadius: 2, backgroundColor: "#D5D8DA" },
  sheetRow: { height: 40, flexDirection: "row", alignItems: "center" },
  sheetSideButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitleButton: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: { color: "#232729", fontSize: 14, fontWeight: "600" },
  sheetDetails: { paddingTop: 15 },
  detailDivider: { height: 1, backgroundColor: "#ECEEEF", marginBottom: 17 },
  detailsHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#A4A9AD",
  },
  statusIndicatorOnline: { backgroundColor: "#36AA6C" },
  detailsTitle: { color: "#1F2325", fontSize: 16, fontWeight: "700" },
  detailsCopy: { color: "#6A7277", fontSize: 13, marginTop: 6 },
  detailsAction: {
    height: 43,
    marginTop: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "#16191B",
  },
  detailsActionOnline: { backgroundColor: "#ff2530" },
  detailsActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";

const START_REGION: Region = {
  latitude: 44.91,
  longitude: -93.29,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

type Coordinate = { latitude: number; longitude: number };

type DriverMapProps = {
  centerRequest: number;
  onCoordinateChange: (coordinate: Coordinate) => void;
};

export default function DriverMap({
  centerRequest,
  onCoordinateChange,
}: DriverMapProps) {
  const mapRef = useRef<MapView>(null);
  const coordinateRef = useRef<Coordinate | null>(null);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [heading, setHeading] = useState(32);

  useEffect(() => {
    const currentCoordinate = coordinateRef.current;
    if (centerRequest === 0 || !currentCoordinate) return;
    mapRef.current?.animateToRegion(
      {
        ...currentCoordinate,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      500,
    );
  }, [centerRequest]);

  useEffect(() => {
    let cancelled = false;
    let positionSubscription: Location.LocationSubscription | undefined;
    let headingSubscription: Location.LocationSubscription | undefined;
    let hasTravelHeading = false;

    const startLocationTracking = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted || cancelled) return;

        const lastKnownPosition = await Location.getLastKnownPositionAsync({
          maxAge: 60_000,
        });
        if (lastKnownPosition && !cancelled) {
          const lastKnownCoordinate = {
            latitude: lastKnownPosition.coords.latitude,
            longitude: lastKnownPosition.coords.longitude,
          };
          coordinateRef.current = lastKnownCoordinate;
          setCoordinate(lastKnownCoordinate);
          onCoordinateChange(lastKnownCoordinate);
          mapRef.current?.animateToRegion(
            {
              ...lastKnownCoordinate,
              latitudeDelta: 0.012,
              longitudeDelta: 0.012,
            },
            0,
          );
        }

        const initialPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;

        const initialCoordinate = {
          latitude: initialPosition.coords.latitude,
          longitude: initialPosition.coords.longitude,
        };
        coordinateRef.current = initialCoordinate;
        setCoordinate(initialCoordinate);
        onCoordinateChange(initialCoordinate);
        mapRef.current?.animateToRegion(
          { ...initialCoordinate, latitudeDelta: 0.012, longitudeDelta: 0.012 },
          650,
        );
        if (
          initialPosition.coords.heading != null &&
          initialPosition.coords.heading >= 0
        ) {
          hasTravelHeading = true;
          setHeading(initialPosition.coords.heading);
        }

        positionSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 2500,
          },
          (position) => {
            if (cancelled) return;
            const nextCoordinate = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            coordinateRef.current = nextCoordinate;
            setCoordinate(nextCoordinate);
            onCoordinateChange(nextCoordinate);
            if (
              position.coords.heading != null &&
              position.coords.heading >= 0
            ) {
              hasTravelHeading = true;
              setHeading(position.coords.heading);
            }
          },
        );

        try {
          headingSubscription = await Location.watchHeadingAsync((value) => {
            if (!cancelled && !hasTravelHeading && value.trueHeading >= 0) {
              setHeading(value.trueHeading);
            }
          });
        } catch {
          // Device heading sensors are optional; location tracking still works.
        }
      } catch {
        // Keep the map available when location services are unavailable.
      }
    };

    void startLocationTracking();
    return () => {
      cancelled = true;
      positionSubscription?.remove();
      headingSubscription?.remove();
    };
  }, [onCoordinateChange]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={START_REGION}
      mapType="standard"
      showsBuildings
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={false}
      toolbarEnabled={false}
      rotateEnabled={false}
    >
      {coordinate && (
        <Marker
          coordinate={coordinate}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={styles.markerHalo}>
            <View
              style={[
                styles.directionArrow,
                { transform: [{ rotate: `${heading}deg` }] },
              ]}
            />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  markerHalo: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#202426",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  directionArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 13,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#202426",
  },
});

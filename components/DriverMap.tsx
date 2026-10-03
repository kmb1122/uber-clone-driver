import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

const DEFAULT_COORDINATE = { latitude: 44.91, longitude: -93.29 };
const ZOOM = 15;
const TILE_SIZE = 256;
const TILE_URL = "https://tile.openstreetmap.org";

type Coordinate = { latitude: number; longitude: number };
type DriverMapProps = {
  centerRequest: number;
  onCoordinateChange: (coordinate: Coordinate) => void;
};

function toWorldPixels(coordinate: Coordinate) {
  const tileCount = 2 ** ZOOM;
  const latitude = Math.max(-85.0511, Math.min(85.0511, coordinate.latitude));
  const sinLatitude = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((coordinate.longitude + 180) / 360) * tileCount * TILE_SIZE,
    y:
      (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      tileCount *
      TILE_SIZE,
  };
}

export default function DriverMap({
  centerRequest,
  onCoordinateChange,
}: DriverMapProps) {
  const { height, width } = useWindowDimensions();
  const [coordinate, setCoordinate] = useState(DEFAULT_COORDINATE);
  const [heading, setHeading] = useState(32);

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;

    const startLocationTracking = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted || cancelled) return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;

        const initialCoordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoordinate(initialCoordinate);
        onCoordinateChange(initialCoordinate);
        if (position.coords.heading != null && position.coords.heading >= 0) {
          setHeading(position.coords.heading);
        }
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 15 },
          (nextPosition) => {
            if (cancelled) return;
            const nextCoordinate = {
              latitude: nextPosition.coords.latitude,
              longitude: nextPosition.coords.longitude,
            };
            setCoordinate(nextCoordinate);
            onCoordinateChange(nextCoordinate);
            if (
              nextPosition.coords.heading != null &&
              nextPosition.coords.heading >= 0
            ) {
              setHeading(nextPosition.coords.heading);
            }
          },
        );
      } catch {
        // Keep the preview map available if browser location is unavailable.
      }
    };

    void startLocationTracking();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [onCoordinateChange]);

  const tiles = useMemo(() => {
    const center = toWorldPixels(coordinate);
    const firstColumn = Math.floor((center.x - width / 2) / TILE_SIZE);
    const lastColumn = Math.floor((center.x + width / 2) / TILE_SIZE);
    const firstRow = Math.floor((center.y - height / 2) / TILE_SIZE);
    const lastRow = Math.floor((center.y + height / 2) / TILE_SIZE);
    const tileCount = 2 ** ZOOM;
    const result: { key: string; uri: string; left: number; top: number }[] =
      [];

    for (let tileX = firstColumn; tileX <= lastColumn; tileX += 1) {
      for (let tileY = firstRow; tileY <= lastRow; tileY += 1) {
        if (tileY < 0 || tileY >= tileCount) continue;
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        result.push({
          key: `${tileX}-${tileY}`,
          uri: `${TILE_URL}/${ZOOM}/${wrappedX}/${tileY}.png`,
          left: tileX * TILE_SIZE - center.x + width / 2,
          top: tileY * TILE_SIZE - center.y + height / 2,
        });
      }
    }
    return result;
  }, [coordinate, height, width]);

  return (
    <View style={styles.map}>
      {tiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.uri }}
          resizeMode="stretch"
          style={[styles.tile, { left: tile.left, top: tile.top }]}
        />
      ))}
      <View pointerEvents="none" style={styles.positionMarker}>
        <View style={styles.markerHalo}>
          <View
            style={[
              styles.directionArrow,
              { transform: [{ rotate: `${heading}deg` }] },
            ]}
          />
        </View>
      </View>
      <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: "#E9EDF0",
  },
  tile: { position: "absolute", width: TILE_SIZE, height: TILE_SIZE },
  positionMarker: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    alignItems: "center",
    justifyContent: "center",
  },
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
  attribution: {
    position: "absolute",
    bottom: 64,
    left: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.78)",
    color: "#4B555A",
    fontSize: 9,
  },
});

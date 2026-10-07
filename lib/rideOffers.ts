import { supabase } from "@/lib/supabase";

export type Coordinate = { latitude: number; longitude: number };

export type NearbyRide = {
  id: string;
  distanceMeters: number;
  durationSeconds: number | null;
  fare: string;
  rating: string | null;
  pickupAddress: string;
  dropoffAddress: string;
};

type RideRecord = Record<string, unknown>;

type RouteMatrixElement = {
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  status?: number | string;
  condition?: string;
};

const MIN_DISTANCE_METERS = 3000;
const MAX_DISTANCE_METERS = 5000;
const ROUTE_BATCH_SIZE = 625;

function readCoordinate(ride: RideRecord): Coordinate | null {
  const pickup =
    ride.pickup && typeof ride.pickup === "object"
      ? (ride.pickup as RideRecord)
      : {};
  const pickupLocation =
    ride.pickup_location && typeof ride.pickup_location === "object"
      ? (ride.pickup_location as RideRecord)
      : {};
  const latitude =
    ride.pickup_latitude ??
    ride.pickup_lat ??
    ride.origin_latitude ??
    ride.origin_lat ??
    pickup.latitude ??
    pickup.lat ??
    pickupLocation.latitude ??
    pickupLocation.lat;
  const longitude =
    ride.pickup_longitude ??
    ride.pickup_lng ??
    ride.origin_longitude ??
    ride.origin_lng ??
    pickup.longitude ??
    pickup.lng ??
    pickupLocation.longitude ??
    pickupLocation.lng;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function readText(ride: RideRecord, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = ride[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

function parseDuration(duration: string | undefined) {
  if (!duration) return null;
  const seconds = Number.parseFloat(duration.replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds : null;
}

function routeSucceeded(element: RouteMatrixElement) {
  return (
    element.condition === "ROUTE_EXISTS" ||
    element.status === 0 ||
    element.status === "OK"
  );
}

export async function fetchNearbySearchingRides(
  driver: Coordinate,
): Promise<NearbyRide[]> {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "searching");

  if (error) throw error;

  const rides = (data ?? []) as RideRecord[];
  const candidates = rides
    .map((ride, index) => ({ ride, index, pickup: readCoordinate(ride) }))
    .filter(
      (candidate): candidate is typeof candidate & { pickup: Coordinate } =>
        candidate.pickup !== null,
    );

  if (candidates.length === 0) return [];

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_APIKEY;
  if (!apiKey) {
    throw new Error("Google Maps API key is not configured.");
  }

  const matches: NearbyRide[] = [];
  for (let offset = 0; offset < candidates.length; offset += ROUTE_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + ROUTE_BATCH_SIZE);
    const response = await fetch(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "originIndex,destinationIndex,distanceMeters,duration,status,condition",
        },
        body: JSON.stringify({
          origins: [
            {
              waypoint: {
                location: {
                  latLng: {
                    latitude: driver.latitude,
                    longitude: driver.longitude,
                  },
                },
              },
            },
          ],
          destinations: batch.map(({ pickup }) => ({
            waypoint: {
              location: {
                latLng: {
                  latitude: pickup.latitude,
                  longitude: pickup.longitude,
                },
              },
            },
          })),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Google Routes API request failed (${response.status}).`);
    }

    const elements = (await response.json()) as RouteMatrixElement[];
    for (const element of elements) {
      if (
        !routeSucceeded(element) ||
        typeof element.destinationIndex !== "number" ||
        typeof element.distanceMeters !== "number" ||
        element.distanceMeters < MIN_DISTANCE_METERS ||
        element.distanceMeters > MAX_DISTANCE_METERS
      ) {
        continue;
      }

      const candidate = batch[element.destinationIndex];
      if (!candidate) continue;
      const ride = candidate.ride;
      matches.push({
        id: readText(ride, ["id", "ride_id"], `ride-${candidate.index}`),
        distanceMeters: element.distanceMeters,
        durationSeconds: parseDuration(element.duration),
        fare: readText(
          ride,
          ["fare", "price", "estimated_fare", "amount"],
          "Ride request",
        ),
        rating:
          readText(ride, ["rider_rating", "passenger_rating"], "") || null,
        pickupAddress: readText(
          ride,
          ["pickup_address", "pickup_location", "pickup", "origin_address"],
          "Pickup location",
        ),
        dropoffAddress: readText(
          ride,
          ["dropoff_address", "destination_address", "dropoff", "destination"],
          "Destination",
        ),
      });
    }
  }

  const sortedMatches = matches.sort(
    (first, second) => first.distanceMeters - second.distanceMeters,
  );
  console.log(
    "[ride-offers] Searching rides 3-5 km from driver:",
    sortedMatches.map(({ id, distanceMeters, durationSeconds, fare }) => ({
      id,
      distanceKm: Number((distanceMeters / 1000).toFixed(2)),
      durationSeconds,
      fare,
    })),
  );
  return sortedMatches;
}

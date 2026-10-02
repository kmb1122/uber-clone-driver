import { Redirect, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";

export default function DashboardScreen() {
  const { loading, signOut, user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      Alert.alert(
        "Unable to sign out",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome, Driver!</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      <View style={styles.main}>
        <Text style={styles.placeholder}>
          This is your dashboard placeholder.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: signingOut }}
        disabled={signingOut}
        onPress={handleSignOut}
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && styles.pressed,
        ]}
      >
        {signingOut ? (
          <ActivityIndicator color="#111111" />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  header: {
    alignItems: "center",
    paddingTop: 8,
  },
  title: {
    color: "#111111",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 25,
  },
  email: {
    color: "#777777",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  main: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    color: "#999999",
    fontSize: 16,
    textAlign: "center",
  },
  signOutButton: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#E5E5E5",
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  signOutText: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    backgroundColor: "#F7F7F7",
  },
});

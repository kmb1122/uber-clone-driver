import { Redirect, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";

export default function AccountScreen() {
  const { loading, signOut, user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setErrorMessage(null);
    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) return null;
  if (!user) return <Redirect href="/login" />;

  const firstName = user.user_metadata.first_name;
  const lastName = user.user_metadata.last_name;
  const fullName = [firstName, lastName]
    .filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    )
    .join(" ");
  const displayName = fullName || "Driver Partner";
  const initials = displayName
    .split(/\s+/)
    .map((name) => name[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const showPreference = (title: string, description: string) => {
    Alert.alert(title, description);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Back to map"
          accessibilityRole="button"
          onPress={() => router.replace("/dashboard")}
          hitSlop={10}
          style={styles.backButton}
        >
          <SymbolView
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            size={20}
            tintColor="#202426"
          />
        </Pressable>
        <Text style={styles.pageTitle}>Account</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{initials}</Text>
          </View>
          <View style={styles.profileText}>
            <Text numberOfLines={1} style={styles.name}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={styles.email}>
              {user.email ?? "No email on file"}
            </Text>
            <View style={styles.ratingBadge}>
              <SymbolView
                name={{ ios: "star.fill", android: "star", web: "star" }}
                size={11}
                tintColor="#202426"
              />
              <Text style={styles.ratingText}>4.96</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsBand}>
          <Stat value="1,254" label="TRIPS" />
          <View style={styles.statDivider} />
          <Stat value="2.5" label="YEARS" />
          <View style={styles.statDivider} />
          <Stat value="98%" label="RATING" />
        </View>

        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.options}>
          <AccountOption
            symbol={{
              ios: "wallet.bifold",
              android: "account_balance_wallet",
              web: "account_balance_wallet",
            }}
            title="Earnings"
            subtitle="Weekly overview"
            onPress={() =>
              showPreference(
                "Earnings",
                "Your weekly earnings overview will appear here.",
              )
            }
          />
          <AccountOption
            symbol={{
              ios: "checkmark.shield",
              android: "verified_user",
              web: "verified_user",
            }}
            title="Safety"
            subtitle="Security & Insurance"
            onPress={() =>
              showPreference(
                "Safety",
                "Your safety and insurance information will appear here.",
              )
            }
          />
          <AccountOption
            symbol={{ ios: "gearshape", android: "settings", web: "settings" }}
            title="Settings"
            subtitle="Preferences & Language"
            onPress={() =>
              showPreference(
                "Settings",
                "Your preferences and language options will appear here.",
              )
            }
          />
          <AccountOption
            symbol={{
              ios: "rectangle.portrait.and.arrow.right",
              android: "logout",
              web: "logout",
            }}
            title="Sign Out"
            subtitle="Logout from your account"
            destructive
            onPress={handleSignOut}
            disabled={signingOut}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: signingOut }}
          disabled={signingOut}
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.logOutButton,
            pressed && !signingOut && styles.logOutPressed,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator color="#D94A45" />
          ) : (
            <Text style={styles.logOutText}>Log Out</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

type StatProps = { value: string; label: string };

function Stat({ value, label }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type AccountOptionProps = {
  symbol: ComponentProps<typeof SymbolView>["name"];
  title: string;
  subtitle: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function AccountOption({
  symbol,
  title,
  subtitle,
  destructive = false,
  disabled = false,
  onPress,
}: AccountOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
    >
      <View
        style={[styles.optionIcon, destructive && styles.optionIconDestructive]}
      >
        <SymbolView
          name={symbol}
          size={17}
          tintColor={destructive ? "#D94A45" : "#202426"}
        />
      </View>
      <View style={styles.optionText}>
        <Text
          style={[styles.optionTitle, destructive && styles.destructiveTitle]}
        >
          {title}
        </Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      {disabled ? (
        <ActivityIndicator size="small" color="#D94A45" />
      ) : (
        <SymbolView
          name={{
            ios: "chevron.right",
            android: "chevron_right",
            web: "chevron_right",
          }}
          size={15}
          tintColor="#C9CDCF"
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 18 },
  topBar: {
    height: 46,
    paddingHorizontal: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 32,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: { color: "#202426", fontSize: 18, fontWeight: "700" },
  scrollContent: { paddingBottom: 14 },
  profile: {
    minHeight: 108,
    paddingTop: 4,
    paddingBottom: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  avatar: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 31,
    backgroundColor: "#050505",
  },
  avatarInitial: { color: "#FFFFFF", fontSize: 24, fontWeight: "600" },
  profileText: { flex: 1, justifyContent: "center" },
  name: { color: "#141719", fontSize: 19, fontWeight: "700" },
  email: { color: "#6F767A", fontSize: 14, marginTop: 3 },
  ratingBadge: {
    alignSelf: "flex-start",
    height: 22,
    paddingHorizontal: 8,
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 11,
    backgroundColor: "#F0F1F1",
  },
  ratingText: { color: "#202426", fontSize: 12, fontWeight: "600" },
  statsBand: {
    height: 68,
    marginBottom: 24,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
  },
  stat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  statValue: { color: "#191D1F", fontSize: 17, fontWeight: "700" },
  statLabel: { color: "#858B8F", fontSize: 11, fontWeight: "500" },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: "#DDDFE0",
  },
  sectionTitle: {
    color: "#202426",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 7,
  },
  options: { gap: 3 },
  option: {
    minHeight: 62,
    paddingHorizontal: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionPressed: { opacity: 0.72 },
  optionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "#F0F1F1",
  },
  optionIconDestructive: { backgroundColor: "#F8EEEE" },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { color: "#202426", fontSize: 16, fontWeight: "700" },
  destructiveTitle: { color: "#D94A45" },
  optionSubtitle: { color: "#858B8F", fontSize: 13 },
  footer: { paddingHorizontal: 0, paddingTop: 10, paddingBottom: 2 },
  error: { color: "#B42318", fontSize: 14, marginBottom: 10 },
  logOutButton: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    borderRadius: 8,
    backgroundColor: "#F8F8F8",
    marginBottom: 8,
  },
  logOutPressed: { backgroundColor: "#F1EDED" },
  logOutText: { color: "#D94A45", fontSize: 15, fontWeight: "700" },
});

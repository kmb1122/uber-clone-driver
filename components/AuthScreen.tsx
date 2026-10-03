import { useAuth } from "@/contexts/AuthContext";
import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const unstable_settings = {
  ssr: false,
};

type AuthScreenProps = {
  mode: "signup" | "login";
};

type FieldName = "firstName" | "lastName" | "email" | "password";

const fields = {
  signup: [
    {
      name: "firstName" as const,
      label: "First name",
      placeholder: "First name",
      autoComplete: "given-name" as const,
    },
    {
      name: "lastName" as const,
      label: "Last name",
      placeholder: "Last name",
      autoComplete: "family-name" as const,
    },
    {
      name: "email" as const,
      label: "Email",
      placeholder: "name@example.com",
      autoComplete: "email" as const,
      keyboardType: "email-address" as const,
    },
    {
      name: "password" as const,
      label: "Password",
      placeholder: "Create a password",
      autoComplete: "new-password" as const,
      secureTextEntry: true,
    },
  ],
  login: [
    {
      name: "email" as const,
      label: "Email",
      placeholder: "name@example.com",
      autoComplete: "email" as const,
      keyboardType: "email-address" as const,
    },
    {
      name: "password" as const,
      label: "Password",
      placeholder: "Enter your password",
      autoComplete: "current-password" as const,
      secureTextEntry: true,
    },
  ],
};

export default function AuthScreen({ mode }: AuthScreenProps) {
  const isSignup = mode === "signup";
  const { loading: authLoading, signIn, signUp, user } = useAuth();
  const [form, setForm] = useState<Record<FieldName, string>>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [authLoading, user]);

  const submit = async () => {
    const requiredFields: FieldName[] = isSignup
      ? ["firstName", "lastName", "email", "password"]
      : ["email", "password"];
    if (requiredFields.some((field) => !form[field].trim())) {
      setHasError(true);
      setMessage("Complete all fields to continue.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setHasError(false);

    try {
      const email = form.email.trim().toLowerCase();
      if (isSignup) {
        const hasSession = await signUp({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email,
          password: form.password,
        });
        setMessage(
          hasSession
            ? "Your driver account is ready."
            : "Check your email to confirm your account.",
        );
      } else {
        await signIn(email, form.password);
        setMessage("You are signed in.");
      }
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleContainer}>
            <Text style={styles.title}>
              {isSignup ? "Create Your Account" : "What Is Your Email?"}
            </Text>
          </View>

          <View style={styles.fields}>
            {fields[mode].map((field) => (
              <View key={field.label} style={styles.field}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  accessibilityLabel={field.label}
                  onChangeText={(value) =>
                    setForm((current) => ({ ...current, [field.name]: value }))
                  }
                  autoCapitalize={
                    field.keyboardType === "email-address" ? "none" : "words"
                  }
                  autoComplete={field.autoComplete}
                  keyboardType={field.keyboardType ?? "default"}
                  placeholder={field.placeholder}
                  placeholderTextColor="#686868"
                  secureTextEntry={field.secureTextEntry}
                  style={styles.input}
                  textContentType={
                    field.secureTextEntry ? "password" : undefined
                  }
                  value={form[field.name]}
                />
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting || authLoading }}
            disabled={submitting || authLoading}
            onPress={submit}
            style={({ pressed }) => [
              styles.nextButton,
              pressed && !submitting && styles.nextButtonPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.nextText}>Next</Text>
            )}
          </Pressable>

          {message ? (
            <Text style={[styles.message, hasError && styles.errorMessage]}>
              {message}
            </Text>
          ) : null}

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isSignup
                ? "Already have an account? "
                : "Don't have an account? "}
            </Text>
            <Link href={isSignup ? "/login" : "/"} asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.switchLink}>
                  {isSignup ? "Log In" : "Sign Up"}
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  titleContainer: {
    alignItems: "center",
  },
  title: {
    color: "#111111",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    marginBottom: 38,
  },
  fields: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    color: "#242424",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  input: {
    height: 50,
    borderRadius: 8,
    backgroundColor: "#F1F1F1",
    color: "#111111",
    fontSize: 16,
    paddingHorizontal: 16,
  },
  nextButton: {
    height: 50,
    borderRadius: 8,
    backgroundColor: "#7e7e7e",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  nextButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  nextText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  message: {
    color: "#287A3D",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
  errorMessage: {
    color: "#B42318",
  },
  switchRow: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    minHeight: 44,
  },
  switchText: {
    color: "#111111",
    fontSize: 15,
  },
  switchLink: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "700",
  },
});

const signupForm = document.getElementById("signup-form");
const signupFeedback = document.getElementById("signup-feedback");
const signupButton = signupForm?.querySelector(".signup-btn");
const googleButton = document.getElementById("google-signin-btn");

const setSignupFeedback = (message, type = "error") => {
  if (!signupFeedback) return;
  signupFeedback.textContent = message || "";
  signupFeedback.classList.remove("is-error", "is-success");
  if (message) {
    signupFeedback.classList.add(type === "success" ? "is-success" : "is-error");
  }
};

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setSignupFeedback("");

    const fullName = document.getElementById("full-name")?.value?.trim() || "";
    const username = document.getElementById("username")?.value?.trim() || "";
    const email = document.getElementById("email")?.value?.trim() || "";
    const password = document.getElementById("password")?.value || "";
    const confirmPassword = document.getElementById("confirm-password")?.value || "";
    const termsAccepted = Boolean(document.getElementById("terms")?.checked);

    if (!fullName || !username || !email || !password || !confirmPassword) {
      setSignupFeedback("Please fill in all required fields.");
      return;
    }

    if (!termsAccepted) {
      setSignupFeedback("Please accept the terms to continue.");
      return;
    }

    if (password !== confirmPassword) {
      setSignupFeedback("Passwords do not match.");
      return;
    }

    if (signupButton) {
      signupButton.disabled = true;
      signupButton.textContent = "Creating account...";
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, username, email, password, confirmPassword }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        setSignupFeedback(payload?.error || "Signup failed.");
        return;
      }

      setSignupFeedback("Account created. Redirecting to login...", "success");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 800);
    } catch (error) {
      setSignupFeedback("Unable to reach server. Please try again.");
    } finally {
      if (signupButton) {
        signupButton.disabled = false;
        signupButton.textContent = "Create Account";
      }
    }
  });
}

if (googleButton) {
  googleButton.addEventListener("click", async () => {
    setSignupFeedback("");

    if (typeof window.llmCouncilGoogleSignIn !== "function") {
      setSignupFeedback("Google sign-in is not available right now.");
      return;
    }

    googleButton.disabled = true;
    const originalLabel = googleButton.textContent;
    googleButton.textContent = "Redirecting to Google...";

    try {
      await window.llmCouncilGoogleSignIn();
      setSignupFeedback("Redirecting to Google...");
    } catch (error) {
      const message = String(error?.message || "");
      if (message === "GOOGLE_SIGN_IN_UNAVAILABLE") {
        setSignupFeedback("Google sign-in is unavailable: Firebase is not configured on this server.");
      } else if (message.includes("network-request-failed")) {
        setSignupFeedback("Could not reach Google. Check your connection and try again.");
      } else {
        setSignupFeedback(`Google sign-in failed. ${message || "Please try again."}`);
      }
      googleButton.disabled = false;
      googleButton.textContent = originalLabel;
    }
  });
}

if (typeof window.llmCouncilResumeGoogleSignIn === "function") {
  const hasRedirectMarker = Boolean(sessionStorage.getItem("llmCouncilGoogleRedirect"));
  if (hasRedirectMarker) {
    setSignupFeedback("Completing Google sign-in...");
    if (googleButton) {
      googleButton.disabled = true;
      googleButton.textContent = "Completing sign-in...";
    }
  }

  window.llmCouncilResumeGoogleSignIn().then(({ user, error }) => {
    if (user) return; // navigation is in flight

    if (error) {
      setSignupFeedback(`Google sign-in failed: ${error.message}`);
    } else {
      setSignupFeedback("");
    }
    if (googleButton) {
      googleButton.disabled = false;
      googleButton.textContent = "Sign in with Google";
    }
  });
}

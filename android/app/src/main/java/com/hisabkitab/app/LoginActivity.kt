package com.hisabkitab.app

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.launch
import java.security.MessageDigest
import java.util.UUID

class LoginActivity : AppCompatActivity() {

    private companion object {
        private const val TAG = "HisabKitab_Auth"
        
        // Replace with your Web Client ID from Firebase Console -> Project Settings -> General -> Web API Key / OAuth 2.0 Web Client ID
        private const val WEB_CLIENT_ID = "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
    }

    private lateinit var auth: FirebaseAuth
    private lateinit var credentialManager: CredentialManager
    private lateinit var progressBar: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize Firebase Auth & Credential Manager
        auth = FirebaseAuth.getInstance()
        credentialManager = CredentialManager.create(this)

        // Check if user is already signed in
        if (auth.currentUser != null) {
            navigateToMainActivity()
            return
        }

        // Setup dynamic login view
        setContentView(createLoginView())
    }

    private fun createLoginView(): View {
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(64, 64, 64, 64)
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
        }

        val titleText = android.widget.TextView(this).apply {
            text = "Hisab Kitab"
            textSize = 28f
            setTextColor(android.graphics.Color.WHITE)
            setTypeface(null, android.graphics.Typeface.BOLD)
            gravity = android.view.Gravity.CENTER
        }
        layout.addView(titleText)

        val subtitleText = android.widget.TextView(this).apply {
            text = "Secure Financial Ledger & Cloud Sync"
            textSize = 14f
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
            gravity = android.view.Gravity.CENTER
            setPadding(0, 16, 0, 48)
        }
        layout.addView(subtitleText)

        val googleSignInButton = Button(this).apply {
            text = "Sign in with Google"
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#2563EB"))
            setPadding(32, 16, 32, 16)
            setOnClickListener {
                performGoogleSignIn()
            }
        }
        layout.addView(googleSignInButton)

        progressBar = ProgressBar(this).apply {
            visibility = View.GONE
        }
        layout.addView(progressBar)

        return layout
    }

    private fun performGoogleSignIn() {
        lifecycleScope.launch {
            try {
                showLoading(true)

                // 1. Generate Nonce for security
                val rawNonce = UUID.randomUUID().toString()
                val bytes = rawNonce.toByteArray()
                val md = MessageDigest.getInstance("SHA-256")
                val digest = md.digest(bytes)
                val hashedNonce = digest.fold("") { str, it -> str + "%02x".format(it) }

                // 2. Build GetGoogleIdOption using Credential Manager
                val webClientId = getWebClientId()
                val googleIdOption = GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(webClientId)
                    .setNonce(hashedNonce)
                    .build()

                // 3. Build GetCredentialRequest
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(googleIdOption)
                    .build()

                // 4. Prompt Native Google Account Selector
                val result = credentialManager.getCredential(
                    context = this@LoginActivity,
                    request = request
                )

                // 5. Extract Credentials
                val credential = result.credential
                if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                    val idToken = googleIdTokenCredential.idToken
                    
                    Log.d(TAG, "Google ID Token successfully retrieved.")
                    firebaseAuthWithGoogle(idToken)
                } else {
                    showError("Unrecognized credential format.")
                    showLoading(false)
                }

            } catch (e: GetCredentialCancellationException) {
                Log.w(TAG, "User cancelled Google Sign-In flow.")
                showLoading(false)
            } catch (e: GetCredentialException) {
                Log.e(TAG, "Credential Manager Error: ${e.localizedMessage}", e)
                showError("Google Sign-In failed: ${e.localizedMessage}")
                showLoading(false)
            } catch (e: Exception) {
                Log.e(TAG, "Unexpected Authentication Error: ${e.localizedMessage}", e)
                showError("Error: ${e.localizedMessage}")
                showLoading(false)
            }
        }
    }

    private fun firebaseAuthWithGoogle(idToken: String) {
        val firebaseCredential = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(firebaseCredential)
            .addOnCompleteListener(this) { task ->
                showLoading(false)
                if (task.isSuccessful) {
                    val user = auth.currentUser
                    Log.d(TAG, "Firebase Auth Successful: User ${user?.email}")
                    Toast.makeText(this, "Welcome, ${user?.displayName ?: "User"}!", Toast.LENGTH_SHORT).show()
                    navigateToMainActivity()
                } else {
                    val message = task.exception?.localizedMessage ?: "Firebase Auth Failed"
                    Log.e(TAG, "Firebase Auth Failed", task.exception)
                    showError("Authentication Failed: $message")
                }
            }
    }

    private fun navigateToMainActivity() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
    }

    private fun showLoading(isLoading: Boolean) {
        progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
    }

    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun getWebClientId(): String {
        return try {
            val resId = resources.getIdentifier("default_web_client_id", "string", packageName)
            if (resId != 0) getString(resId) else WEB_CLIENT_ID
        } catch (e: Exception) {
            WEB_CLIENT_ID
        }
    }
}

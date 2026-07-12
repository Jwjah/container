package com.campusprint.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.campusprint.app.ui.auth.LoginScreen
import com.campusprint.app.ui.auth.OtpScreen
import com.campusprint.app.ui.dashboard.DashboardScreen
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun CampusPrintNavGraph(
    navController: NavHostController = rememberNavController(),
    startDestination: String = "login"
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable("login") {
            LoginScreen(
                onLoginSuccess = { email ->
                    navController.navigate("otp/$email")
                },
                onLoginDirect = {
                    navController.navigate("dashboard") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }
        composable("otp/{email}") { backStackEntry ->
            val email = backStackEntry.arguments?.getString("email") ?: ""
            OtpScreen(
                email = email,
                onVerificationSuccess = {
                    navController.navigate("dashboard") {
                        popUpTo("login") { inclusive = true }
                    }
                },
                onBackToLogin = {
                    navController.popBackStack()
                }
            )
        }
        composable("dashboard") {
            val dashboardViewModel: com.campusprint.app.ui.dashboard.DashboardViewModel = hiltViewModel()
            DashboardScreen(
                onLogout = {
                    navController.navigate("login") {
                        popUpTo("dashboard") { inclusive = true }
                    }
                },
                onNavigateToScanner = {
                    navController.navigate("scanner")
                },
                viewModel = dashboardViewModel
            )
        }
        composable("scanner") {
            com.campusprint.app.ui.scanner.ScannerScreen(
                onScanComplete = { scannedHash ->
                    // For demo/simulated purposes, we treat scanned barcode as order ID and mark as Collected
                    val orderId = scannedHash.toIntOrNull() ?: 1
                    // Normally update via ViewModel, popping back for now
                    navController.popBackStack()
                },
                onBack = {
                    navController.popBackStack()
                }
            )
        }
    }
}

package com.campusprint.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusprint.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface AuthUiState {
    object Idle : AuthUiState
    object Loading : AuthUiState
    data class Success(val message: String, val requiresOtp: Boolean, val email: String) : AuthUiState
    data class Error(val error: String) : AuthUiState
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.login(email, password)
                .onSuccess { response ->
                    _uiState.value = AuthUiState.Success(
                        message = response.message,
                        requiresOtp = response.requiresOTP == true,
                        email = email
                    )
                }
                .onFailure { error ->
                    _uiState.value = AuthUiState.Error(error.message ?: "An unknown error occurred")
                }
        }
    }

    fun verifyOtp(email: String, code: String, onComplete: () -> Unit) {
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.verifyOtp(email, code)
                .onSuccess {
                    _uiState.value = AuthUiState.Idle
                    onComplete()
                }
                .onFailure { error ->
                    _uiState.value = AuthUiState.Error(error.message ?: "Verification failed")
                }
        }
    }

    fun resetState() {
        _uiState.value = AuthUiState.Idle
    }
}

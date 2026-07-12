package com.campusprint.app.ui.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.campusprint.app.data.remote.api.OrderDto

@Composable
fun ShopQueueScreen(
    orders: List<OrderDto>,
    onNavigateToScanner: () -> Unit,
    onUpdateStatus: (Int, String) -> Unit,
    modifier: Modifier = Modifier
) {
    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNavigateToScanner,
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = Color.White
            ) {
                Icon(Icons.Default.PlayArrow, contentDescription = "Scan QR")
            }
        }
    ) { paddingValues ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (orders.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = "No active print requests.", style = MaterialTheme.typography.bodyLarge)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(orders) { order ->
                        ShopOrderCard(
                            order = order,
                            onUpdateStatus = { status -> onUpdateStatus(order.id, status) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ShopOrderCard(
    order: OrderDto,
    onUpdateStatus: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "#ORD-${order.id}",
                    style = MaterialTheme.typography.titleMedium
                )
                StatusBadge(status = order.status)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Type: ${order.print_type}",
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                text = "${order.files.size} file(s) • ${order.copies} copy/copies",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary
            )
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (order.status.lowercase() == "pending") {
                    Button(
                        onClick = { onUpdateStatus("Printed") },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Mark Printed")
                    }
                } else if (order.status.lowercase() == "printed") {
                    Button(
                        onClick = { onUpdateStatus("Collected") },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669))
                    ) {
                        Text("Mark Collected")
                    }
                }
            }
        }
    }
}

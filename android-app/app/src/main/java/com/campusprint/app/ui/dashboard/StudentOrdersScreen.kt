package com.campusprint.app.ui.dashboard

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.campusprint.app.data.remote.api.OrderDto

@Composable
fun StudentOrdersScreen(
    orders: List<OrderDto>,
    modifier: Modifier = Modifier
) {
    var selectedOrder by remember { mutableStateOf<OrderDto?>(null) }

    Box(modifier = modifier.fillMaxSize()) {
        if (orders.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(text = "No orders found.", style = MaterialTheme.typography.bodyLarge)
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(orders) { order ->
                    OrderCard(order = order, onClick = { selectedOrder = order })
                }
            }
        }

        selectedOrder?.let { order ->
            OrderDetailDialog(
                order = order,
                onDismiss = { selectedOrder = null }
            )
        }
    }
}

@Composable
fun OrderCard(
    order: OrderDto,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
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
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "₹${order.total_price}",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailDialog(
    order: OrderDto,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
        title = { Text(text = "Order Details") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "Order ID: #ORD-${order.id}", style = MaterialTheme.typography.titleMedium)
                Text(text = "Status: ${order.status}")
                Text(text = "Total Price: ₹${order.total_price}")
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = "Files:", style = MaterialTheme.typography.titleSmall)
                order.files.forEach { file ->
                    Text(
                        text = "• ${file.original_name} (${file.page_count} pages)",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    // Visual placeholder for pickup QR
                    Surface(
                        modifier = Modifier.size(150.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.medium
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = "QR: ${order.order_hash.take(8)}...",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
            }
        }
    )
}

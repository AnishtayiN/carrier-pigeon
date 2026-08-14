import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:carrier_pigeon/models/message.dart';
import 'package:carrier_pigeon/services/pigeon_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';

class TrackingScreen extends StatefulWidget {
  final PigeonMessage message;
  const TrackingScreen({super.key, required this.message});

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  late MapController _mapController;
  Timer? _updateTimer;
  PigeonMessage get msg => widget.message;

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    _updateTimer = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _updateTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pigeonPos = LatLng(msg.currentLat, msg.currentLng);
    final senderPos = LatLng(msg.senderLat, msg.senderLng);
    final receiverPos = LatLng(msg.receiverLat, msg.receiverLng);

    return Scaffold(
      appBar: AppBar(
        title: const Text('鸽 ردیابی کبوتر'),
        backgroundColor: AppColors.primaryDark,
      ),
      body: Column(
        children: [
          // Status bar
          _buildStatusBar(),
          // Map
          Expanded(
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: pigeonPos,
                initialZoom: 6,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.carrierpigeon.app',
                ),
                // Route line
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: [senderPos, pigeonPos, receiverPos],
                      color: AppColors.mapRoute,
                      strokeWidth: 3,
                      isDotted: true,
                    ),
                  ],
                ),
                // Sender marker
                MarkerLayer(
                  markers: [
                    Marker(
                      point: senderPos,
                      width: 40,
                      height: 40,
                      child: const Column(
                        children: [
                          Text('📍', style: TextStyle(fontSize: 28)),
                          Text('مبدأ',
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  backgroundColor: Colors.white70)),
                        ],
                      ),
                    ),
                    Marker(
                      point: receiverPos,
                      width: 40,
                      height: 40,
                      child: const Column(
                        children: [
                          Text('🏁', style: TextStyle(fontSize: 28)),
                          Text('مقصد',
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  backgroundColor: Colors.white70)),
                        ],
                      ),
                    ),
                    Marker(
                      point: pigeonPos,
                      width: 50,
                      height: 50,
                      child: Column(
                        children: [
                          Text(
                            msg.status == MessageStatus.lost ? '💀' : '🕊️',
                            style: const TextStyle(fontSize: 32),
                          ),
                          if (msg.status == MessageStatus.inTransit)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppColors.pigeonFlying,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${(msg.progress * 100).toStringAsFixed(0)}%',
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 10),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Details panel
          _buildDetailsPanel(),
        ],
      ),
    );
  }

  Widget _buildStatusBar() {
    Color bgColor;
    String text;
    IconData icon;

    switch (msg.status) {
      case MessageStatus.inTransit:
        bgColor = AppColors.pigeonFlying;
        text = '鸽 کبوتر در حال پرواز...';
        icon = Icons.flight;
        break;
      case MessageStatus.delivered:
        bgColor = AppColors.pigeonDelivered;
        text = '鸽 کبوتر رسید!';
        icon = Icons.check_circle;
        break;
      case MessageStatus.lost:
        bgColor = AppColors.pigeonLost;
        text = '鸽 کبوتر گم شد!';
        icon = Icons.error;
        break;
      case MessageStatus.sending:
        bgColor = Colors.orange;
        text = '鸽 در حال آماده‌سازی...';
        icon = Icons.hourglass_empty;
        break;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: bgColor,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(color: Colors.white, fontSize: 16)),
        ],
      ),
    );
  }

  Widget _buildDetailsPanel() {
    final remaining = msg.distanceKm * (1 - msg.progress);
    final remainingTime = Duration(
        minutes: (remaining / msg.speedKmh * 60).round());

    return Container(
      padding: const EdgeInsets.all(16),
      color: AppColors.cardBg,
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildDetailItem('📏', 'مسافت', PigeonService.formatDistance(msg.distanceKm)),
              _buildDetailItem('⚡', 'سرعت', '${msg.speedKmh.toStringAsFixed(0)} km/h'),
              _buildDetailItem('📍', 'باقی‌مانده', PigeonService.formatDistance(remaining)),
              _buildDetailItem('⏱', 'زمان باقی', PigeonService.formatDuration(remainingTime)),
            ],
          ),
          const SizedBox(height: 12),
          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: msg.progress,
              minHeight: 8,
              backgroundColor: Colors.grey[200],
              valueColor: AlwaysStoppedAnimation<Color>(
                msg.status == MessageStatus.lost
                    ? AppColors.pigeonLost
                    : AppColors.pigeonFlying,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'پیام: ${msg.content}',
            style: const TextStyle(color: AppColors.textSecondary),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildDetailItem(String emoji, String label, String value) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 20)),
        const SizedBox(height: 4),
        Text(value,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        Text(label,
            style: TextStyle(color: Colors.grey[500], fontSize: 11)),
      ],
    );
  }
}

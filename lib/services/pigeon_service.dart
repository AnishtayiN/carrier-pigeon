import 'dart:async';
import 'dart:math';
import 'package:carrier_pigeon/models/message.dart';

class PigeonService {
  static final PigeonService _instance = PigeonService._internal();
  factory PigeonService() => _instance;
  PigeonService._internal();

  final _random = Random();
  Timer? _ticker;
  final List<Function(PigeonMessage)> _listeners = [];

  void addListener(Function(PigeonMessage) listener) {
    _listeners.add(listener);
  }

  void removeListener(Function(PigeonMessage) listener) {
    _listeners.remove(listener);
  }

  void startSimulation(List<PigeonMessage> messages) {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(milliseconds: 500), (_) {
      for (var msg in messages) {
        if (msg.status == MessageStatus.inTransit) {
          _updatePigeonPosition(msg);
        }
      }
    });
  }

  void stopSimulation() {
    _ticker?.cancel();
  }

  void _updatePigeonPosition(PigeonMessage msg) {
    // 0.2% chance per tick to get lost
    if (_random.nextDouble() < 0.002) {
      msg.status = MessageStatus.lost;
      _notifyListeners(msg);
      return;
    }

    // Speed varies ±25%
    double speedVariation = 0.75 + _random.nextDouble() * 0.5;
    double effectiveSpeed = msg.speedKmh * speedVariation;

    // Progress increment based on speed and distance
    // Each tick = 0.5 seconds, so increment = (speed / 3600) * 0.5 / distance * 1000
    double increment = (effectiveSpeed / 3600.0) * 0.5 / (msg.distanceKm * 1000) * 1000;
    msg.progress = min(1.0, msg.progress + increment);

    // Interpolate position
    msg.currentLat =
        msg.senderLat + (msg.receiverLat - msg.senderLat) * msg.progress;
    msg.currentLng =
        msg.senderLng + (msg.receiverLng - msg.senderLng) * msg.progress;

    // Add slight curve (pigeons don't fly straight!)
    double curve = sin(msg.progress * pi) * 0.05;
    msg.currentLat += curve;

    if (msg.progress >= 1.0) {
      msg.status = MessageStatus.delivered;
      msg.deliveredAt = DateTime.now();
      msg.currentLat = msg.receiverLat;
      msg.currentLng = msg.receiverLng;
    }

    _notifyListeners(msg);
  }

  void _notifyListeners(PigeonMessage msg) {
    for (var listener in _listeners) {
      listener(msg);
    }
  }

  /// Calculate distance between two points using Haversine formula
  static double calculateDistance(
      double lat1, double lng1, double lat2, double lng2) {
    const double earthRadius = 6371; // km
    double dLat = _toRad(lat2 - lat1);
    double dLng = _toRad(lng2 - lng1);
    double a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_toRad(lat1)) * cos(_toRad(lat2)) *
            sin(dLng / 2) * sin(dLng / 2);
    double c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return earthRadius * c;
  }

  static double _toRad(double deg) => deg * pi / 180;

  /// Format distance for display
  static String formatDistance(double km) {
    if (km < 1) return '${(km * 1000).toStringAsFixed(0)} m';
    if (km < 100) return '${km.toStringAsFixed(1)} km';
    return '${km.toStringAsFixed(0)} km';
  }

  /// Format duration for display
  static String formatDuration(Duration d) {
    if (d.inHours > 0) {
      return '${d.inHours}h ${d.inMinutes % 60}m';
    }
    if (d.inMinutes > 0) {
      return '${d.inMinutes}m ${d.inSeconds % 60}s';
    }
    return '${d.inSeconds}s';
  }
}

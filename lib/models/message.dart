import 'package:uuid/uuid.dart';

enum MessageStatus { sending, inTransit, delivered, lost }

class PigeonMessage {
  final String id;
  final String senderId;
  final String receiverId;
  final String content;
  final DateTime sentAt;
  DateTime? deliveredAt;
  MessageStatus status;
  final double senderLat;
  final double senderLng;
  final double receiverLat;
  final double receiverLng;
  double currentLat;
  double currentLng;
  final double distanceKm;
  final double speedKmh;
  double progress; // 0.0 to 1.0

  PigeonMessage({
    String? id,
    required this.senderId,
    required this.receiverId,
    required this.content,
    DateTime? sentAt,
    this.deliveredAt,
    this.status = MessageStatus.sending,
    required this.senderLat,
    required this.senderLng,
    required this.receiverLat,
    required this.receiverLng,
    double? currentLat,
    double? currentLng,
    required this.distanceKm,
    double speedKmh = 177.0,
    this.progress = 0.0,
  })  : id = id ?? const Uuid().v4(),
        sentAt = sentAt ?? DateTime.now(),
        speedKmh = speedKmh * (0.75 + (DateTime.now().millisecond % 50) / 100),
        currentLat = currentLat ?? senderLat,
        currentLng = currentLng ?? senderLng;

  double get estimatedMinutes => (distanceKm / speedKmh) * 60;

  String get statusText {
    switch (status) {
      case MessageStatus.sending:
        return '鸽 در حال آماده‌سازی...';
      case MessageStatus.inTransit:
        return '鸽 در حال پرواز (${(progress * 100).toStringAsFixed(0)}%)';
      case MessageStatus.delivered:
        return '鸽 رسید!';
      case MessageStatus.lost:
        return '鸽 گم شد!';
    }
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'senderId': senderId,
        'receiverId': receiverId,
        'content': content,
        'sentAt': sentAt.toIso8601String(),
        'deliveredAt': deliveredAt?.toIso8601String(),
        'status': status.index,
        'senderLat': senderLat,
        'senderLng': senderLng,
        'receiverLat': receiverLat,
        'receiverLng': receiverLng,
        'currentLat': currentLat,
        'currentLng': currentLng,
        'distanceKm': distanceKm,
        'speedKmh': speedKmh,
        'progress': progress,
      };

  factory PigeonMessage.fromMap(Map<String, dynamic> m) => PigeonMessage(
        id: m['id'],
        senderId: m['senderId'],
        receiverId: m['receiverId'],
        content: m['content'],
        sentAt: DateTime.parse(m['sentAt']),
        deliveredAt:
            m['deliveredAt'] != null ? DateTime.parse(m['deliveredAt']) : null,
        status: MessageStatus.values[m['status'] ?? 0],
        senderLat: (m['senderLat'] ?? 0).toDouble(),
        senderLng: (m['senderLng'] ?? 0).toDouble(),
        receiverLat: (m['receiverLat'] ?? 0).toDouble(),
        receiverLng: (m['receiverLng'] ?? 0).toDouble(),
        currentLat: (m['currentLat'] ?? m['senderLat'] ?? 0).toDouble(),
        currentLng: (m['currentLng'] ?? m['senderLng'] ?? 0).toDouble(),
        distanceKm: (m['distanceKm'] ?? 0).toDouble(),
        speedKmh: (m['speedKmh'] ?? 177).toDouble(),
        progress: (m['progress'] ?? 0).toDouble(),
      );
}

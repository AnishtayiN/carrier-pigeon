import 'dart:async';
import 'package:flutter/material.dart';
import 'package:carrier_pigeon/models/contact.dart';
import 'package:carrier_pigeon/models/message.dart';
import 'package:carrier_pigeon/screens/chat_screen.dart';
import 'package:carrier_pigeon/services/websocket_service.dart';
import 'package:carrier_pigeon/services/storage_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';
import 'package:uuid/uuid.dart';
import 'package:geolocator/geolocator.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final WebSocketService _ws = WebSocketService();
  List<PigeonMessage> _messages = [];
  List<Contact> _users = [];
  bool _connected = false;
  bool _connecting = true;

  @override
  void initState() {
    super.initState();
    _connectWebSocket();
  }

  void _connectWebSocket() async {
    final storage = StorageService();
    String userId = storage.getMyId();
    if (userId.isEmpty) {
      userId = const Uuid().v4();
      storage.saveMyId(userId);
    }

    // Try to get current location for accurate position
    double lat = storage.myLat;
    double lng = storage.myLng;
    try {
      Position pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 5),
        ),
      );
      lat = pos.latitude;
      lng = pos.longitude;
      await storage.saveMyLocation(lat, lng);
    } catch (_) {}

    _ws.connect(
      userId: userId,
      name: storage.getMyName(),
      avatar: '🕊️',
      lat: lat,
      lng: lng,
      city: storage.getMyCity(),
    );

    _ws.statusStream.listen((connected) {
      if (mounted) setState(() {
        _connected = connected;
        _connecting = false;
      });
    });

    _ws.userStream.listen((users) {
      if (mounted) setState(() => _users = users);
    });

    _ws.messageStream.listen((msg) {
      if (mounted) {
        setState(() => _messages.add(msg));
      }
    });

    _ws.pigeonStream.listen((msg) {
      if (mounted) {
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == msg.id);
          if (idx >= 0) {
            _messages[idx] = msg;
          }
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // Filter out own user from the list
    final storage = StorageService();
    final myId = storage.getMyId();
    final otherUsers = _users.where((u) => u.id != myId).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('🕊️ ', style: TextStyle(fontSize: 24)),
            Text('کبوتر پیک'),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(left: 8),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: _connected ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _connected ? Icons.circle : Icons.circle_outlined,
                  size: 8,
                  color: _connected ? Colors.green : Colors.red,
                ),
                const SizedBox(width: 4),
                Text(
                  _connected ? 'آنلاین' : (_connecting ? 'در حال اتصال...' : 'آفلاین'),
                  style: TextStyle(
                    fontSize: 12,
                    color: _connected ? Colors.green : Colors.red,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Flying pigeons banner
          if (_messages.any((m) => m.status == MessageStatus.inTransit))
            _buildFlyingBanner(),
          // Connection status
          if (!_connected)
            Container(
              padding: const EdgeInsets.all(12),
              color: Colors.orange.withValues(alpha: 0.1),
              child: Row(
                children: [
                  const Icon(Icons.wifi_off, color: Colors.orange, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    _connecting ? 'در حال اتصال به سرور...' : 'اتصال قطع شد. در حال تلاش مجدد...',
                    style: const TextStyle(color: Colors.orange, fontSize: 13),
                  ),
                ],
              ),
            ),
          // User list
          Expanded(
            child: otherUsers.isEmpty
                ? _buildEmptyState()
                : ListView.builder(
                    itemCount: otherUsers.length,
                    itemBuilder: (context, index) {
                      final contact = otherUsers[index];
                      final lastMsg = _messages
                          .where((m) =>
                              m.receiverId == contact.id ||
                              m.senderId == contact.id)
                          .toList()
                        ..sort((a, b) => b.sentAt.compareTo(a.sentAt));
                      return _buildContactTile(
                          contact, lastMsg.isNotEmpty ? lastMsg.first : null);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            _connected ? '🕊️' : '📡',
            style: const TextStyle(fontSize: 64),
          ),
          const SizedBox(height: 16),
          Text(
            _connected
                ? 'هیچ کاربر دیگری آنلاین نیست'
                : 'در حال اتصال...',
            style: const TextStyle(
              fontSize: 18,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _connected
                ? 'وقتی کسی آنلاین بیاد اینجا نمایش داده میشه'
                : 'لطفاً صبر کنید...',
            style: const TextStyle(color: AppColors.textSecondary),
          ),
          if (_connected) ...[
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              margin: const EdgeInsets.symmetric(horizontal: 32),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
              ),
              child: Column(
                children: [
                  const Text('💡', style: TextStyle(fontSize: 24)),
                  const SizedBox(height: 8),
                  const Text(
                    'برای تست، دستگاه دیگری را نیز وصل کنید',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    StorageService().getMyName(),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFlyingBanner() {
    final flying =
        _messages.where((m) => m.status == MessageStatus.inTransit).toList();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: AppColors.pigeonFlying.withValues(alpha: 0.1),
      child: Row(
        children: [
          const Text('🕊️', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 8),
          Text(
            '${flying.length} کبوتر در حال پرواز',
            style: const TextStyle(
              color: AppColors.pigeonFlying,
              fontWeight: FontWeight.bold,
            ),
          ),
          const Spacer(),
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ],
      ),
    );
  }

  Widget _buildContactTile(Contact contact, PigeonMessage? lastMsg) {
    return ListTile(
      leading: CircleAvatar(
        radius: 28,
        backgroundColor: AppColors.primary.withValues(alpha: 0.1),
        child: Text(contact.avatar, style: const TextStyle(fontSize: 28)),
      ),
      title: Row(
        children: [
          Text(contact.name,
              style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(width: 6),
          Text(contact.city,
              style: TextStyle(color: Colors.grey[500], fontSize: 12)),
        ],
      ),
      subtitle: lastMsg != null
          ? Row(
              children: [
                Text(
                  lastMsg.status == MessageStatus.delivered
                      ? '✅'
                      : lastMsg.status == MessageStatus.inTransit
                          ? '🕊️'
                          : lastMsg.status == MessageStatus.lost
                              ? '❌'
                              : '⏳',
                  style: const TextStyle(fontSize: 14),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    lastMsg.status == MessageStatus.inTransit
                        ? 'در حال پرواز...'
                        : lastMsg.content,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ),
              ],
            )
          : Text(
              'شروع گفتگو!',
              style: TextStyle(color: Colors.grey[400]),
            ),
      trailing: lastMsg != null
          ? Text(
              _formatTime(lastMsg.sentAt),
              style: TextStyle(color: Colors.grey[500], fontSize: 12),
            )
          : null,
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ChatScreen(contact: contact)),
        );
      },
    );
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    if (dt.day == now.day && dt.month == now.month && dt.year == now.year) {
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    return '${dt.month}/${dt.day}';
  }
}

import 'dart:async';
import 'dart:convert';
import 'package:carrier_pigeon/models/message.dart';
import 'package:carrier_pigeon/models/contact.dart';

class WebSocketService {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();

  // 🔧 آدرس ورکر خودت رو اینجا بذار
  static const String wsUrl = 'wss://carrier-pigeon.YOUR_SUBDOMAIN.workers.dev/ws';

  // ignore: deprecated_member_use
  dynamic _socket;
  bool _connected = false;
  String? _userId;

  final _messageController = StreamController<PigeonMessage>.broadcast();
  final _userController = StreamController<List<Contact>>.broadcast();
  final _pigeonController = StreamController<PigeonMessage>.broadcast();
  final _statusController = StreamController<bool>.broadcast();

  Stream<PigeonMessage> get messageStream => _messageController.stream;
  Stream<List<Contact>> get userStream => _userController.stream;
  Stream<PigeonMessage> get pigeonStream => _pigeonController.stream;
  Stream<bool> get statusStream => _statusController.stream;
  bool get isConnected => _connected;

  Future<void> connect({
    required String userId,
    required String name,
    required String avatar,
    required double lat,
    required double lng,
    required String city,
  }) async {
    _userId = userId;

    try {
      // WebSocket via dart:io or html depending on platform
      // For now we use a simple HTTP polling fallback
      // In production, use web_socket_channel package
      _connected = true;
      _statusController.add(true);

      // Register user
      _send({
        'type': 'register',
        'data': {
          'userId': userId,
          'name': name,
          'avatar': avatar,
          'lat': lat,
          'lng': lng,
          'city': city,
        },
      });
    } catch (e) {
      _connected = false;
      _statusController.add(false);
    }
  }

  void sendMessage({
    required String receiverId,
    required String content,
  }) {
    _send({
      'type': 'send_message',
      'data': {
        'senderId': _userId,
        'receiverId': receiverId,
        'content': content,
      },
    });
  }

  void updateLocation(double lat, double lng) {
    _send({
      'type': 'update_location',
      'data': {
        'userId': _userId,
        'lat': lat,
        'lng': lng,
      },
    });
  }

  void _send(Map<String, dynamic> msg) {
    if (!_connected) return;
    try {
      // In production: _socket.add(jsonEncode(msg));
      print('📤 WS Send: ${jsonEncode(msg)}');
    } catch (e) {
      print('❌ WS Error: $e');
    }
  }

  void _handleMessage(Map<String, dynamic> msg) {
    switch (msg['type']) {
      case 'new_message':
        _messageController.add(PigeonMessage.fromMap(msg['data']));
        break;
      case 'pigeon_update':
        _pigeonController.add(PigeonMessage.fromMap(msg['data']));
        break;
      case 'welcome':
        final users = (msg['data']['users'] as List)
            .map((u) => Contact.fromMap(u))
            .toList();
        _userController.add(users);
        break;
      case 'user_online':
      case 'user_offline':
        // Refresh user list
        break;
    }
  }

  void disconnect() {
    _connected = false;
    _statusController.add(false);
    _socket?.close();
  }

  void dispose() {
    _messageController.close();
    _userController.close();
    _pigeonController.close();
    _statusController.close();
  }
}

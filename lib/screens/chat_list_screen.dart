import 'package:flutter/material.dart';
import 'package:carrier_pigeon/models/contact.dart';
import 'package:carrier_pigeon/models/message.dart';
import 'package:carrier_pigeon/screens/chat_screen.dart';
import 'package:carrier_pigeon/services/storage_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  List<PigeonMessage> _messages = [];

  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  void _loadMessages() {
    setState(() {
      _messages = StorageService().loadMessages();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('🕊️ ', style: TextStyle(fontSize: 24)),
            Text('کبوتر پیک'),
          ],
        ),
      ),
      body: Column(
        children: [
          // Flying pigeons banner
          if (_messages.any((m) => m.status == MessageStatus.inTransit))
            _buildFlyingBanner(),
          // Contact list
          Expanded(
            child: ListView.builder(
              itemCount: Contact.sampleContacts.length,
              itemBuilder: (context, index) {
                final contact = Contact.sampleContacts[index];
                final lastMsg = _messages
                    .where((m) =>
                        m.receiverId == contact.id || m.senderId == contact.id)
                    .toList()
                  ..sort((a, b) => b.sentAt.compareTo(a.sentAt));
                return _buildContactTile(contact, lastMsg.isNotEmpty ? lastMsg.first : null);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFlyingBanner() {
    final flying = _messages.where((m) => m.status == MessageStatus.inTransit).toList();
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
          Text(contact.name, style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(width: 6),
          Text(contact.city, style: TextStyle(color: Colors.grey[500], fontSize: 12)),
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
                        ? '鸽 در حال پرواز...'
                        : lastMsg.content,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ),
              ],
            )
          : Text(
              'پیامی نیست - شروع کنید!',
              style: TextStyle(color: Colors.grey[400]),
            ),
      trailing: lastMsg != null
          ? Text(
              _formatTime(lastMsg.sentAt),
              style: TextStyle(color: Colors.grey[500], fontSize: 12),
            )
          : null,
      onTap: () async {
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ChatScreen(contact: contact)),
        );
        _loadMessages();
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

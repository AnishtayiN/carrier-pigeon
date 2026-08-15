import 'package:flutter/material.dart';
import 'package:carrier_pigeon/models/contact.dart';
import 'package:carrier_pigeon/models/message.dart';
import 'package:carrier_pigeon/screens/tracking_screen.dart';
import 'package:carrier_pigeon/services/websocket_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';

class ChatScreen extends StatefulWidget {
  final Contact contact;
  const ChatScreen({super.key, required this.contact});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final WebSocketService _ws = WebSocketService();
  List<PigeonMessage> _messages = [];
  bool _showSendAnimation = false;

  @override
  void initState() {
    super.initState();
    _listenToMessages();
  }

  void _listenToMessages() {
    _ws.pigeonStream.listen((msg) {
      if (mounted && (msg.receiverId == widget.contact.id || msg.senderId == widget.contact.id)) {
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == msg.id);
          if (idx >= 0) {
            _messages[idx] = msg;
          } else {
            _messages.add(msg);
          }
          _messages.sort((a, b) => a.sentAt.compareTo(b.sentAt));
        });
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    _ws.sendMessage(
      receiverId: widget.contact.id,
      content: text,
    );

    _controller.clear();
    setState(() => _showSendAnimation = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _showSendAnimation = false);
    });

    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(widget.contact.avatar, style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.contact.name, style: const TextStyle(fontSize: 16)),
                Text(
                  widget.contact.city,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.map_outlined),
            onPressed: () {
              final inFlight = _messages
                  .where((m) => m.status == MessageStatus.inTransit)
                  .toList();
              if (inFlight.isNotEmpty) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => TrackingScreen(message: inFlight.last),
                  ),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('鸽 کبوتری در حال پرواز نیست')),
                );
              }
            },
          ),
        ],
      ),
      body: Container(
        color: const Color(0xFFECE5DD),
        child: Column(
          children: [
            _buildDistanceBanner(),
            Expanded(
              child: _messages.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(12),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) =>
                          _buildMessageBubble(_messages[index]),
                    ),
            ),
            if (_showSendAnimation) _buildSendAnimation(),
            _buildInputBar(),
          ],
        ),
      ),
    );
  }

  Widget _buildDistanceBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppColors.primary.withValues(alpha: 0.05),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('📍 ', style: TextStyle(fontSize: 14)),
          Text(
            widget.contact.city,
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          const SizedBox(width: 12),
          const Text('🕊️ ', style: TextStyle(fontSize: 14)),
          Text(
            ' سرعت ۱۷۷ کیلومتر بر ساعت',
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
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
          const Text('🕊️', style: TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          Text(
            'پیامی به ${widget.contact.name} نیست',
            style: const TextStyle(
              fontSize: 18,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'یک پیام بنویس و کبوتر رو بفرست!',
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(PigeonMessage msg) {
    final isMe = msg.senderId == 'me';
    return GestureDetector(
      onTap: msg.status == MessageStatus.inTransit
          ? () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => TrackingScreen(message: msg)),
            )
          : null,
      child: Align(
        alignment: isMe ? Alignment.centerLeft : Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          decoration: BoxDecoration(
            color: isMe ? AppColors.sentMessage : AppColors.receivedMessage,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(12),
              topRight: const Radius.circular(12),
              bottomLeft: Radius.circular(isMe ? 12 : 0),
              bottomRight: Radius.circular(isMe ? 0 : 12),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 3,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                msg.content,
                style: const TextStyle(fontSize: 15),
                textDirection: TextDirection.rtl,
              ),
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    msg.statusText,
                    style: TextStyle(
                      fontSize: 11,
                      color: _statusColor(msg.status),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${msg.sentAt.hour.toString().padLeft(2, '0')}:${msg.sentAt.minute.toString().padLeft(2, '0')}',
                    style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _statusColor(MessageStatus status) {
    switch (status) {
      case MessageStatus.sending:
        return Colors.orange;
      case MessageStatus.inTransit:
        return AppColors.pigeonFlying;
      case MessageStatus.delivered:
        return AppColors.pigeonDelivered;
      case MessageStatus.lost:
        return AppColors.pigeonLost;
    }
  }

  Widget _buildSendAnimation() {
    return Container(
      height: 40,
      color: AppColors.pigeonFlying.withValues(alpha: 0.1),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('🕊️', style: TextStyle(fontSize: 20)),
          SizedBox(width: 8),
          Text(
            'کبوتر در حال پرواز...',
            style: TextStyle(color: AppColors.pigeonFlying),
          ),
        ],
      ),
    );
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      color: AppColors.cardBg,
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF0F0F0),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: TextField(
                  controller: _controller,
                  textDirection: TextDirection.rtl,
                  decoration: const InputDecoration(
                    hintText: 'پیام بنویس...',
                    hintTextDirection: TextDirection.rtl,
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              decoration: const BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
              ),
              child: IconButton(
                icon: const Icon(Icons.send, color: Colors.white, size: 20),
                onPressed: _sendMessage,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:carrier_pigeon/services/storage_service.dart';
import 'package:carrier_pigeon/services/pigeon_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _nameController = TextEditingController();
  final _latController = TextEditingController();
  final _lngController = TextEditingController();

  @override
  void initState() {
    super.initState();
    final storage = StorageService();
    _nameController.text = storage.getMyName();
    _latController.text = storage.myLat.toStringAsFixed(4);
    _lngController.text = storage.myLng.toStringAsFixed(4);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _latController.dispose();
    _lngController.dispose();
    super.dispose();
  }

  void _saveSettings() async {
    final storage = StorageService();
    await storage.saveMyName(_nameController.text.trim());
    final lat = double.tryParse(_latController.text) ?? 35.6892;
    final lng = double.tryParse(_lngController.text) ?? 51.3890;
    await storage.saveMyLocation(lat, lng);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تنظیمات ذخیره شد'),
          backgroundColor: AppColors.pigeonDelivered,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('⚙️ تنظیمات'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Profile section
            _buildSection('👤 پروفایل', [
              _buildTextField('نام شما', _nameController, Icons.person),
            ]),
            const SizedBox(height: 20),

            // Location section
            _buildSection('📍 مکان شما', [
              Row(
                children: [
                  Expanded(
                    child: _buildTextField('عرض جغرافیایی', _latController, Icons.my_location),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildTextField('طول جغرافیایی', _lngController, Icons.my_location),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () {
                  _latController.text = '35.6892';
                  _lngController.text = '51.3890';
                },
                icon: const Icon(Icons.location_city),
                label: const Text('تهران (پیش‌فرض)'),
              ),
            ]),
            const SizedBox(height: 20),

            // About section
            _buildSection('ℹ️ درباره', [
              _buildInfoRow('نام اپ', AppConstants.appName),
              _buildInfoRow('نسخه', '1.0.0'),
              _buildInfoRow('سرعت کبوتر', '${AppConstants.pigeonSpeedKmh} km/h'),
              _buildInfoRow('احتمال گم شدن', '${(AppConstants.lostProbability * 100).toStringAsFixed(1)}%'),
              _buildInfoRow('تغییر سرعت', '±${(AppConstants.speedVariance * 100).toStringAsFixed(0)}%'),
            ]),
            const SizedBox(height: 20),

            // Save button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _saveSettings,
                icon: const Text('🕊️', style: TextStyle(fontSize: 20)),
                label: const Text(
                  'ذخیره تنظیمات',
                  style: TextStyle(fontSize: 16),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, IconData icon) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[600])),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

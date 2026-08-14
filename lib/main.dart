import 'package:flutter/material.dart';
import 'package:carrier_pigeon/screens/home_screen.dart';
import 'package:carrier_pigeon/services/storage_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await StorageService().init();
  runApp(const CarrierPigeonApp());
}

class CarrierPigeonApp extends StatelessWidget {
  const CarrierPigeonApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConstants.appNameFa,
      theme: AppTheme.theme,
      debugShowCheckedModeBanner: false,
      locale: const Locale('fa', 'IR'),
      home: const HomeScreen(),
    );
  }
}

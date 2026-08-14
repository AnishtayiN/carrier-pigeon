import 'package:flutter/material.dart';

class AppColors {
  static const Color primary = Color(0xFF1B5E20);
  static const Color primaryLight = Color(0xFF4C8C4A);
  static const Color primaryDark = Color(0xFF003300);
  static const Color accent = Color(0xFFFF8F00);
  static const Color background = Color(0xFFF5F5F0);
  static const Color cardBg = Colors.white;
  static const Color textPrimary = Color(0xFF212121);
  static const Color textSecondary = Color(0xFF757575);
  static const Color sentMessage = Color(0xFFDCF8C6);
  static const Color receivedMessage = Colors.white;
  static const Color pigeonFlying = Color(0xFF2196F3);
  static const Color pigeonDelivered = Color(0xFF4CAF50);
  static const Color pigeonLost = Color(0xFFF44336);
  static const Color mapRoute = Color(0xFF1B5E20);
}

class AppTheme {
  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          brightness: Brightness.light,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: true,
        ),
        cardTheme: CardTheme(
          elevation: 2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
        ),
      );
}

class AppConstants {
  static const double pigeonSpeedKmh = 177.0;
  static const double lostProbability = 0.002;
  static const double speedVariance = 0.25;
  static const String appName = 'Carrier Pigeon';
  static const String appNameFa = 'کبوتر پیک';
}

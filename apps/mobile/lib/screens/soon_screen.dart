import 'package:flutter/material.dart';

import '../l10n/gen/app_localizations.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/alert_card.dart';

/// Holds a tab's place until it is built (map: phase 3, alert history: phase 4).
class SoonScreen extends StatelessWidget {
  const SoonScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(HwSize.space4),
        children: [
          Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.headlineSmall)),
          const SizedBox(height: HwSize.space3),
          CalmBox(text: AppLocalizations.of(context).settingsSoon),
        ],
      ),
    );
  }
}

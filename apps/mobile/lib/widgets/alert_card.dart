import 'package:flutter/material.dart';

import '../theme/hw_app_theme.dart';
import 'severity.dart';

/// Design system AlertCard (`.m-alert`): the whole card is `sev-*-soft`, no coloured edge. Titles already open with
/// the level word, so the level reads without colour; the meter repeats it.
class AlertCard extends StatelessWidget {
  const AlertCard({super.key, required this.level, required this.title, this.body, this.meta, this.action});

  final HwLevel level;
  final String title;
  final String? body;

  /// Source and time, e.g. "อัปเดต 8 นาทีที่แล้ว".
  final String? meta;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final ink = c.text(level);
    return Container(
      padding: const EdgeInsets.all(HwSize.space4),
      decoration: BoxDecoration(color: c.soft(level), borderRadius: BorderRadius.circular(HwSize.radiusCard)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: HwSize.space3,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: SeverityMeter(level: level, large: true, color: ink),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: HwSize.space1,
              children: [
                Semantics(
                  header: true,
                  child: Text(title, style: text.titleMedium!.copyWith(color: ink)),
                ),
                if (body != null) Text(body!, style: text.bodyLarge),
                if (meta != null)
                  Padding(
                    padding: const EdgeInsets.only(top: HwSize.space1),
                    child: Text(meta!, style: text.bodySmall),
                  ),
                if (action != null)
                  Padding(
                    padding: const EdgeInsets.only(top: HwSize.space2),
                    child: action,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Design system `.m-calm`: shown instead of alert cards only when nothing shown is at caution or above.
class CalmBox extends StatelessWidget {
  const CalmBox({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(HwSize.space4),
      decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: BorderRadius.circular(HwSize.radiusCard)),
      child: Text(text, style: Theme.of(context).textTheme.bodyLarge!.copyWith(color: c.inkMuted)),
    );
  }
}

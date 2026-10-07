import 'package:flutter/material.dart';

import '../theme/hw_app_theme.dart';

/// Design system card (`.m-card`): surface, `line` border, `rounded-card`, `space-4` padding; `shadow-raised` in the
/// light theme only. Title row with optional status, then content, data-age note and source.
class HwCard extends StatelessWidget {
  const HwCard({super.key, this.title, required this.child, this.status, this.note, this.source});

  final String? title;
  final Widget child;
  final Widget? status;
  final String? note;
  final String? source;

  static const _raisedLight = [BoxShadow(color: Color(0x0F0F1B2E), offset: Offset(0, 1), blurRadius: 2)];

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final light = Theme.of(context).brightness == Brightness.light;
    return Container(
      padding: const EdgeInsets.all(HwSize.space4),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border.all(color: c.line),
        borderRadius: BorderRadius.circular(HwSize.radiusCard),
        boxShadow: light ? _raisedLight : null,
      ),
      // Transparent Material so ripples on controls inside the card paint above its background.
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: HwSize.space3,
          children: [
            if (title != null || status != null)
              Row(
                spacing: HwSize.space3,
                children: [
                  Expanded(
                    child: title == null
                        ? const SizedBox()
                        : Semantics(header: true, child: Text(title!, style: text.titleMedium)),
                  ),
                  ?status,
                ],
              ),
            child,
            // Data age is system status, not risk: neutral tones, never sev* colours.
            if (note != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: HwSize.space3, vertical: HwSize.space2),
                decoration: BoxDecoration(
                  color: c.surfaceSunken,
                  borderRadius: BorderRadius.circular(HwSize.radiusControl),
                ),
                child: Text(note!, style: text.labelLarge),
              ),
            if (source != null) Text(source!, style: text.bodySmall),
          ],
        ),
      ),
    );
  }
}

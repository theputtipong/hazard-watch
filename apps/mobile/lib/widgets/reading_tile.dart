import 'package:flutter/material.dart';

import '../theme/hw_app_theme.dart';
import 'severity.dart';
import 'source_link.dart';

/// Design system list card (`.m-list`): ReadingTiles stacked in one card, divided by `line`.
class ReadingList extends StatelessWidget {
  const ReadingList({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border.all(color: c.line),
        borderRadius: BorderRadius.circular(HwSize.radiusCard),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(height: 1, thickness: 1, color: c.line),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

/// Design system ReadingTile (`.m-tile`): one reading from the nearest sensor with what it means. Every row has a note.
/// A stale reading shows "—" and no badge, and its note says when the last value came in.
class ReadingTile extends StatelessWidget {
  const ReadingTile({
    super.key,
    required this.label,
    required this.value,
    this.unit,
    required this.level,
    required this.note,
    required this.meta,
    this.sources = const [],
    required this.semantics,
    this.stale = false,
    this.onTap,
  });

  /// "ฝุ่น PM2.5 · สามย่านมิตรทาวน์"
  final String label;
  final String value;
  final String? unit;
  final HwLevel level;
  final String note;

  /// "ข้อมูลจาก ThaiWater · 17:00 น. · 3.1 กม."
  final String meta;

  /// Names in [meta] linked to their original source.
  final List<SourceRef> sources;

  /// The whole row read as one sentence.
  final String semantics;
  final bool stale;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: HwSize.touchTarget),
        child: Padding(
          padding: const EdgeInsets.all(HwSize.space4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 2,
            children: [
              // The links stay outside so screen readers can still reach them.
              Semantics(
                label: semantics,
                button: onTap != null,
                excludeSemantics: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 2,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: HwSize.space3,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 2,
                            children: [
                              Text(label, style: text.labelLarge!.copyWith(color: c.inkMuted)),
                              // One paragraph, not a Row: on a narrow phone the unit wraps under the value instead of
                              // running off the edge, and both still sit on one baseline.
                              Text.rich(
                                TextSpan(
                                  text: stale ? '—' : value,
                                  style: text.headlineMedium!.copyWith(color: stale ? c.inkMuted : null),
                                  children: [
                                    if (unit != null && !stale) ...[
                                      const WidgetSpan(child: SizedBox(width: HwSize.space2)),
                                      TextSpan(
                                        text: unit,
                                        style: text.labelLarge!.copyWith(color: c.inkMuted),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (!stale) SeverityBadge(level: level),
                      ],
                    ),
                    Text(note, style: text.bodyLarge),
                  ],
                ),
              ),
              SourceText(meta, sources: sources, style: text.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

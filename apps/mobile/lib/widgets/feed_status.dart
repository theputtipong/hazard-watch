import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme/hw_app_theme.dart';

/// Design system FeedStatus (`.m-feed`): state shown by shape (dot / ring / cross), never by sev-* colour.
/// Compact, for a small tile: the name, then the age under it, one line each (cut with … when longer; screen readers
/// get the full text).
class FeedStatusRow extends StatelessWidget {
  const FeedStatusRow({super.key, required this.name, required this.state, required this.age});

  final String name;
  final FeedState state;
  final String age;

  /// The state mark's column; the name and anything under it line up past it.
  static const double markWidth = 16;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    // Its own node: inside a card it would otherwise merge into the card's title.
    return Semantics(
      container: true,
      label: '$name, $age',
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: HwSize.space2,
        children: [
          // Centred on the name's first line (labelLarge: 14 × 1.571).
          SizedBox(
            width: markWidth,
            height: 22,
            child: Center(child: _Mark(state)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: text.labelLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(
                  age,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodySmall!.copyWith(color: state == FeedState.down ? c.ink : c.inkMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Mark extends StatelessWidget {
  const _Mark(this.state);

  final FeedState state;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return switch (state) {
      FeedState.live => Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: c.inkMuted, shape: BoxShape.circle),
      ),
      FeedState.stale => Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: c.inkMuted, width: 2),
        ),
      ),
      FeedState.down => Icon(Icons.close_rounded, size: 14, color: c.ink),
    };
  }
}

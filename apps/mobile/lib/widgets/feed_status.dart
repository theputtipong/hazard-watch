import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme/hw_app_theme.dart';

/// Design system FeedStatus (`.m-feed`): state shown by shape (dot / ring / cross), never by sev-* colour.
/// The age text wraps under itself rather than being cut.
class FeedStatusRow extends StatelessWidget {
  const FeedStatusRow({super.key, required this.name, required this.state, required this.age});

  final String name;
  final FeedState state;
  final String age;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return Semantics(
      label: '$name, $age',
      excludeSemantics: true,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: HwSize.touchTarget),
        child: Row(
          spacing: HwSize.space2,
          children: [
            SizedBox(width: 20, child: Center(child: _Mark(state))),
            Expanded(child: Text(name, style: text.bodyLarge)),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 170),
              child: Text(
                age,
                textAlign: TextAlign.right,
                style: text.bodySmall!.copyWith(color: state == FeedState.down ? c.ink : c.inkMuted),
              ),
            ),
          ],
        ),
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

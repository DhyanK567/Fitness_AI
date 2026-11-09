# Phase 3 Implementation Plan

## Missing Services to Implement
1. [ ] **BrandService** (T-69: getBrandHealthMetrics) - MISSING
2. [ ] ClassCancellationImpactService (T-51) - missing
3. **Session Summary Agent Tools** (session-summary agent):
   - session-debrief tool
   - trainer-notes tool
   - member-milestones tool
4. **Advertising Agent** - verify tools are properly registered
5. **Session Summary Agent** - needs 3 tools:
   - session-debrief
   - trainer-notes
   - member-milestones

## Implementation Order:
1. BrandService (T-69 getBrandHealthMetrics)
2. ClassCancellationImpactService (T-51)
3. Session Summary Agent tools (session-debrief, trainer-notes, member-milestones)
4. Register all new tools in AiModule
5. Run tests to verify
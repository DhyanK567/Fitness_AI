import { Module } from '@nestjs/common';
import { ChurnPredictionService } from './churn-prediction.service';
import { EngagementScoringService } from './engagement-scoring.service';
import { WinbackCampaignService } from './winback-campaign.service';
import { RetentionActionService } from './retention-action.service';

@Module({
  providers: [
    ChurnPredictionService,
    EngagementScoringService,
    WinbackCampaignService,
    RetentionActionService,
  ],
  exports: [
    ChurnPredictionService,
    EngagementScoringService,
    WinbackCampaignService,
    RetentionActionService,
  ],
})
export class RetentionModule {}
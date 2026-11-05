/**
 * ERP Method Names - Single Source of Truth
 *
 * All ERPNext/Frappe whitelisted method names used across:
 * - NestJS Services (SL track)
 * - AI Tools (AIP track)
 * - ERP Python APIs (ERPE track)
 *
 * Format: MODULE_ACTION
 * All methods prefixed with 'wellness_studio.api.'
 */

export const ERP_METHODS = {
  // ============================================
  // MEMBERS
  // ============================================
  MEMBER_LIST: 'wellness_studio.api.member.list',
  MEMBER_GET: 'wellness_studio.api.member.get',
  MEMBER_CREATE: 'wellness_studio.api.member.create_member',
  MEMBER_UPDATE: 'wellness_studio.api.member.update',
  MEMBER_DELETE: 'wellness_studio.api.member.delete',
  MEMBER_SEARCH: 'wellness_studio.api.member.search',

  // ============================================
  // MEMBERSHIPS
  // ============================================
  MEMBERSHIP_LIST: 'wellness_studio.api.membership.list',
  MEMBERSHIP_GET: 'wellness_studio.api.membership.get',
  MEMBERSHIP_CREATE: 'wellness_studio.api.membership.create',
  MEMBERSHIP_UPDATE: 'wellness_studio.api.membership.update',
  MEMBERSHIP_CANCEL: 'wellness_studio.api.membership.cancel',
  MEMBERSHIP_ACTIVATE: 'wellness_studio.api.membership_activation.activate',
  MEMBERSHIP_EXPIRE: 'wellness_studio.api.membership_activation.expire_memberships',

  // ============================================
  // CLASS TYPES (Master data)
  // ============================================
  CLASS_TYPE_LIST: 'wellness_studio.api.class_type.list',
  CLASS_TYPE_GET: 'wellness_studio.api.class_type.get',
  CLASS_TYPE_CREATE: 'wellness_studio.api.class_type.create',
  CLASS_TYPE_UPDATE: 'wellness_studio.api.class_type.update',
  CLASS_TYPE_DELETE: 'wellness_studio.api.class_type.delete',

  // ============================================
  // CLASS SCHEDULES (Recurring templates)
  // ============================================
  CLASS_SCHEDULE_LIST: 'wellness_studio.api.class_schedule.list',
  CLASS_SCHEDULE_GET: 'wellness_studio.api.class_schedule.get',
  CLASS_SCHEDULE_CREATE: 'wellness_studio.api.class_schedule.create',
  CLASS_SCHEDULE_UPDATE: 'wellness_studio.api.class_schedule.update',
  CLASS_SCHEDULE_DELETE: 'wellness_studio.api.class_schedule.delete',

  // ============================================
  // CLASS SESSIONS / SCHEDULES (Instances)
  // ============================================
  SCHEDULE_LIST: 'wellness_studio.api.schedule.list',
  SCHEDULE_GET: 'wellness_studio.api.schedule.get',
  SCHEDULE_CREATE: 'wellness_studio.api.schedule.create',
  SCHEDULE_UPDATE: 'wellness_studio.api.schedule.update',
  SCHEDULE_DELETE: 'wellness_studio.api.schedule.delete',

  // ============================================
  // BOOKINGS
  // ============================================
  BOOKING_LIST: 'wellness_studio.api.booking.list',
  BOOKING_GET: 'wellness_studio.api.booking.get',
  BOOKING_CREATE: 'wellness_studio.api.booking.book',
  BOOKING_UPDATE: 'wellness_studio.api.booking.update',
  BOOKING_CANCEL: 'wellness_studio.api.booking.cancel',
  BOOKING_PROMOTE_WAITLIST: 'wellness_studio.api.booking.promote_waitlist',

  // ============================================
  // ATTENDANCE
  // ============================================
  ATTENDANCE_LIST: 'wellness_studio.api.attendance.list',
  ATTENDANCE_GET: 'wellness_studio.api.attendance.get',
  ATTENDANCE_CREATE: 'wellness_studio.api.attendance.create',
  ATTENDANCE_UPDATE: 'wellness_studio.api.attendance.update',
  ATTENDANCE_DELETE: 'wellness_studio.api.attendance.delete',
  ATTENDANCE_CHECK_IN: 'wellness_studio.api.check_in.check_in',

  // ============================================
  // LEADS
  // ============================================
  LEAD_LIST: 'wellness_studio.api.lead.list',
  LEAD_GET: 'wellness_studio.api.lead.get',
  LEAD_CREATE: 'wellness_studio.api.lead.create',
  LEAD_UPDATE: 'wellness_studio.api.lead.update',
  LEAD_CONVERT: 'wellness_studio.api.lead.convert',

  // ============================================
  // PAYMENTS
  // ============================================
  PAYMENT_LIST: 'wellness_studio.api.payment.list',
  PAYMENT_GET: 'wellness_studio.api.payment.get',
  PAYMENT_CREATE: 'wellness_studio.api.payment.create',
  PAYMENT_UPDATE: 'wellness_studio.api.payment.update',
  PAYMENT_POST: 'wellness_studio.api.payment.post_payment',
  PAYMENT_REFUND: 'wellness_studio.api.payment.refund',
  PAYMENT_WEBHOOK: 'wellness_studio.api.payment.webhook',

  // ============================================
  // EVENTS
  // ============================================
  EVENT_LIST: 'wellness_studio.api.events.list_events',
  EVENT_GET: 'wellness_studio.api.event.get',
  EVENT_CREATE: 'wellness_studio.api.event.create',
  EVENT_UPDATE: 'wellness_studio.api.event.update',
  EVENT_DELETE: 'wellness_studio.api.event.delete',

  // ============================================
  // REPORTS / DASHBOARD
  // ============================================
  REPORT_RUN: 'wellness_studio.api.reports.run_report',
  REPORT_LOW_ATTENDANCE: 'wellness_studio.api.report.low_attendance_classes',
  REPORT_EXPIRING_MEMBERSHIPS: 'wellness_studio.api.report.expiring_memberships',
  REPORT_DASHBOARD_STATS: 'wellness_studio.api.dashboard.stats',
  REPORT_DASHBOARD_SUMMARY: 'wellness_studio.api.reports.dashboard_summary',
  REPORT_REVENUE_SUMMARY: 'wellness_studio.api.report.revenue_summary',
  REPORT_REVENUE_TRENDS: 'wellness_studio.api.report.revenue_trends',
  REPORT_ATTENDANCE: 'wellness_studio.api.report.attendance',
  REPORT_MEMBERSHIPS: 'wellness_studio.api.report.memberships',

  // ============================================
  // WAITLIST (use booking-based waitlist via WS Booking.status = 'Waitlisted')
  // ============================================

  // ============================================
  // HEALTH / SYSTEM
  // ============================================
  HEALTH: 'wellness_studio.api.health.health',
  VERSION: 'wellness_studio.api.health.version',

  // ============================================
  // EVENTS (for callbacks)
  // ============================================
  EVENT_MEMBER_CREATED: 'member.created',
  EVENT_MEMBER_UPDATED: 'member.updated',
  EVENT_MEMBERSHIP_CREATED: 'membership.created',
  EVENT_MEMBERSHIP_ACTIVATED: 'membership.activated',
  EVENT_MEMBERSHIP_EXPIRED: 'membership.expired',
  EVENT_BOOKING_CREATED: 'booking.created',
  EVENT_BOOKING_CANCELLED: 'booking.cancelled',
  EVENT_BOOKING_PROMOTED: 'booking.promoted',
  EVENT_ATTENDANCE_CHECKED_IN: 'attendance.checked_in',
  EVENT_PAYMENT_RECEIVED: 'payment.received',
  EVENT_LEAD_CREATED: 'lead.created',
  EVENT_LEAD_CONVERTED: 'lead.converted',

  // ============================================
  // STAFF
  // ============================================
  STAFF_LIST: 'wellness_studio.api.staff.list',
  STAFF_GET: 'wellness_studio.api.staff.get',
  STAFF_CREATE: 'wellness_studio.api.staff.create',
  STAFF_UPDATE: 'wellness_studio.api.staff.update',
  STAFF_DELETE: 'wellness_studio.api.staff.delete',

  // ============================================
  // FEEDBACK
  // ============================================
  FEEDBACK_LIST: 'wellness_studio.api.feedback.list',
  FEEDBACK_GET: 'wellness_studio.api.feedback.get',
  FEEDBACK_CREATE: 'wellness_studio.api.feedback.create',
  FEEDBACK_UPDATE: 'wellness_studio.api.feedback.update',
  FEEDBACK_DELETE: 'wellness_studio.api.feedback.delete',

  // ============================================
  // RECOMMENDATIONS
  // ============================================
  RECOMMENDATION_GET: 'wellness_studio.api.recommendation.get',

  // ============================================
  // CRM (Phase 3)
  // ============================================
  PIPELINE_STAGE_LIST: 'wellness_studio.api.pipeline_stage.list',
  PIPELINE_STAGE_GET: 'wellness_studio.api.pipeline_stage.get',
  PIPELINE_STAGE_CREATE: 'wellness_studio.api.pipeline_stage.create',
  PIPELINE_STAGE_UPDATE: 'wellness_studio.api.pipeline_stage.update',
  PIPELINE_STAGE_DELETE: 'wellness_studio.api.pipeline_stage.delete',
  PIPELINE_ENTRY_LIST: 'wellness_studio.api.pipeline_entry.list',
  PIPELINE_ENTRY_GET: 'wellness_studio.api.pipeline_entry.get',
  PIPELINE_ENTRY_CREATE: 'wellness_studio.api.pipeline_entry.create',
  PIPELINE_ENTRY_MOVE: 'wellness_studio.api.pipeline_entry.move',
  CRM_CAMPAIGN_LIST: 'wellness_studio.api.crm_campaign.list',
  CRM_CAMPAIGN_GET: 'wellness_studio.api.crm_campaign.get',
  CRM_CAMPAIGN_CREATE: 'wellness_studio.api.crm_campaign.create',
  CRM_CAMPAIGN_UPDATE: 'wellness_studio.api.crm_campaign.update',
  CRM_CAMPAIGN_ENROLL: 'wellness_studio.api.crm_campaign.enroll',
  CRM_CAMPAIGN_METRICS: 'wellness_studio.api.crm_campaign.metrics',

  // ============================================
  // Retention (Phase 4)
  // ============================================
  WINBACK_CAMPAIGN_CREATE: 'wellness_studio.api.winback_campaign.create',
  WINBACK_CAMPAIGN_SEND: 'wellness_studio.api.winback_campaign.send',
  RETENTION_ACTION_CREATE: 'wellness_studio.api.retention_action.create',
  RETENTION_ACTION_LIST: 'wellness_studio.api.retention_action.list',
  RETENTION_METRICS: 'wellness_studio.api.retention.metrics',

  // ============================================
  // OPERATIONS (Phase 5)
  // ============================================
  REPORT_CLASS_CAPACITY_UTILIZATION: 'wellness_studio.api.operations.class_capacity_utilization',
  STAFF_SCHEDULE_LIST: 'wellness_studio.api.operations.staff_schedule_list',
  STAFF_SCHEDULE_CREATE: 'wellness_studio.api.operations.staff_schedule_create',
  EQUIPMENT_LIST: 'wellness_studio.api.operations.equipment_list',
  EQUIPMENT_MAINTENANCE_SCHEDULE: 'wellness_studio.api.operations.schedule_equipment_maintenance',
  FACILITY_UTILIZATION: 'wellness_studio.api.operations.facility_utilization',
  GET_OPERATIONAL_ALERTS: 'wellness_studio.api.operations.get_operational_alerts',
  ACKNOWLEDGE_OPERATIONAL_ALERT: 'wellness_studio.api.operations.acknowledge_operational_alert',
  GET_CLASS_CANCELLATION_IMPACT: 'wellness_studio.api.operations.class_cancellation_impact',
  OPTIMIZE_CLASS_SCHEDULE: 'wellness_studio.api.operations.optimize_class_schedule',

  // ============================================
  // GROWTH (Phase 5)
  // ============================================
  GET_ACQUISITION_METRICS: 'wellness_studio.api.growth.acquisition_metrics',
  GET_REFERRAL_METRICS: 'wellness_studio.api.referral.metrics',
  CREATE_REFERRAL_CAMPAIGN: 'wellness_studio.api.referral.create_campaign',
  GET_UPSELL_OPPORTUNITIES: 'wellness_studio.api.growth.upsell_opportunities',
  CREATE_UPSELL_OFFER: 'wellness_studio.api.growth.create_upsell_offer',
  GET_LIFETIME_VALUE_METRICS: 'wellness_studio.api.growth.lifetime_value',
  GET_EXPANSION_OPPORTUNITIES: 'wellness_studio.api.growth.expansion_opportunities',
  TRACK_GROWTH_EXPERIMENT: 'wellness_studio.api.growth.track_experiment',
  CREATE_GROWTH_EXPERIMENT: 'wellness_studio.api.growth.create_experiment',

  // ============================================
  // MARKETING (Phase 5)
  // ============================================
  GET_CAMPAIGN_PERFORMANCE: 'wellness_studio.api.marketing.campaign_performance',
  CREATE_MARKETING_CAMPAIGN: 'wellness_studio.api.marketing.create_marketing_campaign',
  GET_AUDIENCE_SEGMENTS: 'wellness_studio.api.marketing.audience_segments',
  CREATE_AUDIENCE_SEGMENT: 'wellness_studio.api.marketing.create_audience_segment',
  GET_CONTENT_CALENDAR: 'wellness_studio.api.marketing.content_calendar',
  SCHEDULE_CONTENT: 'wellness_studio.api.marketing.schedule_content',
  GET_LEAD_ATTRIBUTION: 'wellness_studio.api.marketing.lead_attribution',
  GET_BRAND_HEALTH_METRICS: 'wellness_studio.api.marketing.brand_health_metrics',
  MANAGE_REVIEW_RESPONSE: 'wellness_studio.api.marketing.manage_review_response',
  GET_COMPETITOR_INTELLIGENCE: 'wellness_studio.api.marketing.competitor_intelligence',
} as const;
export type ErpMethod = typeof ERP_METHODS[keyof typeof ERP_METHODS];

// Helper to get all methods for a module
export const ERP_METHODS_BY_MODULE = {
  member: [
    ERP_METHODS.MEMBER_LIST,
    ERP_METHODS.MEMBER_GET,
    ERP_METHODS.MEMBER_CREATE,
    ERP_METHODS.MEMBER_UPDATE,
    ERP_METHODS.MEMBER_DELETE,
    ERP_METHODS.MEMBER_SEARCH,
  ],
  membership: [
    ERP_METHODS.MEMBERSHIP_LIST,
    ERP_METHODS.MEMBERSHIP_GET,
    ERP_METHODS.MEMBERSHIP_CREATE,
    ERP_METHODS.MEMBERSHIP_UPDATE,
    ERP_METHODS.MEMBERSHIP_CANCEL,
    ERP_METHODS.MEMBERSHIP_ACTIVATE,
    ERP_METHODS.MEMBERSHIP_EXPIRE,
  ],
  class_type: [
    ERP_METHODS.CLASS_TYPE_LIST,
    ERP_METHODS.CLASS_TYPE_GET,
    ERP_METHODS.CLASS_TYPE_CREATE,
    ERP_METHODS.CLASS_TYPE_UPDATE,
    ERP_METHODS.CLASS_TYPE_DELETE,
  ],
  class_schedule: [
    ERP_METHODS.CLASS_SCHEDULE_LIST,
    ERP_METHODS.CLASS_SCHEDULE_GET,
    ERP_METHODS.CLASS_SCHEDULE_CREATE,
    ERP_METHODS.CLASS_SCHEDULE_UPDATE,
    ERP_METHODS.CLASS_SCHEDULE_DELETE,
  ],
  schedule: [
    ERP_METHODS.SCHEDULE_LIST,
    ERP_METHODS.SCHEDULE_GET,
    ERP_METHODS.SCHEDULE_CREATE,
    ERP_METHODS.SCHEDULE_UPDATE,
    ERP_METHODS.SCHEDULE_DELETE,
  ],
  booking: [
    ERP_METHODS.BOOKING_LIST,
    ERP_METHODS.BOOKING_GET,
    ERP_METHODS.BOOKING_CREATE,
    ERP_METHODS.BOOKING_UPDATE,
    ERP_METHODS.BOOKING_CANCEL,
    ERP_METHODS.BOOKING_PROMOTE_WAITLIST,
  ],
  attendance: [
    ERP_METHODS.ATTENDANCE_LIST,
    ERP_METHODS.ATTENDANCE_GET,
    ERP_METHODS.ATTENDANCE_CREATE,
    ERP_METHODS.ATTENDANCE_UPDATE,
    ERP_METHODS.ATTENDANCE_DELETE,
    ERP_METHODS.ATTENDANCE_CHECK_IN,
  ],
  lead: [
    ERP_METHODS.LEAD_LIST,
    ERP_METHODS.LEAD_GET,
    ERP_METHODS.LEAD_CREATE,
    ERP_METHODS.LEAD_UPDATE,
    ERP_METHODS.LEAD_CONVERT,
  ],
  payment: [
    ERP_METHODS.PAYMENT_LIST,
    ERP_METHODS.PAYMENT_GET,
    ERP_METHODS.PAYMENT_CREATE,
    ERP_METHODS.PAYMENT_POST,
    ERP_METHODS.PAYMENT_REFUND,
    ERP_METHODS.PAYMENT_WEBHOOK,
  ],
  report: [
    ERP_METHODS.REPORT_RUN,
    ERP_METHODS.REPORT_LOW_ATTENDANCE,
    ERP_METHODS.REPORT_EXPIRING_MEMBERSHIPS,
    ERP_METHODS.REPORT_DASHBOARD_STATS,
    ERP_METHODS.REPORT_DASHBOARD_SUMMARY,
    ERP_METHODS.REPORT_REVENUE_SUMMARY,
    ERP_METHODS.REPORT_REVENUE_TRENDS,
  ],
  event: [
    ERP_METHODS.EVENT_LIST,
    ERP_METHODS.EVENT_GET,
    ERP_METHODS.EVENT_CREATE,
    ERP_METHODS.EVENT_UPDATE,
    ERP_METHODS.EVENT_DELETE,
  ],
  staff: [
    ERP_METHODS.STAFF_LIST,
    ERP_METHODS.STAFF_GET,
    ERP_METHODS.STAFF_CREATE,
    ERP_METHODS.STAFF_UPDATE,
    ERP_METHODS.STAFF_DELETE,
  ],
  feedback: [
    ERP_METHODS.FEEDBACK_LIST,
    ERP_METHODS.FEEDBACK_GET,
    ERP_METHODS.FEEDBACK_CREATE,
    ERP_METHODS.FEEDBACK_UPDATE,
    ERP_METHODS.FEEDBACK_DELETE,
  ],
  recommendation: [
    ERP_METHODS.RECOMMENDATION_GET,
  ],
  health: [
    ERP_METHODS.HEALTH,
    ERP_METHODS.VERSION,
  ],

  // ============================================
  // OPERATIONS (Phase 5)
  // ============================================
  operations: [
    ERP_METHODS.REPORT_CLASS_CAPACITY_UTILIZATION,
    ERP_METHODS.STAFF_SCHEDULE_LIST,
    ERP_METHODS.STAFF_SCHEDULE_CREATE,
    ERP_METHODS.EQUIPMENT_LIST,
    ERP_METHODS.EQUIPMENT_MAINTENANCE_SCHEDULE,
    ERP_METHODS.FACILITY_UTILIZATION,
    ERP_METHODS.GET_OPERATIONAL_ALERTS,
    ERP_METHODS.ACKNOWLEDGE_OPERATIONAL_ALERT,
    ERP_METHODS.GET_CLASS_CANCELLATION_IMPACT,
    ERP_METHODS.OPTIMIZE_CLASS_SCHEDULE,
  ],

  // ============================================
  // GROWTH (Phase 5)
  // ============================================
  growth: [
    ERP_METHODS.GET_ACQUISITION_METRICS,
    ERP_METHODS.GET_REFERRAL_METRICS,
    ERP_METHODS.CREATE_REFERRAL_CAMPAIGN,
    ERP_METHODS.GET_UPSELL_OPPORTUNITIES,
    ERP_METHODS.CREATE_UPSELL_OFFER,
    ERP_METHODS.GET_LIFETIME_VALUE_METRICS,
    ERP_METHODS.GET_EXPANSION_OPPORTUNITIES,
    ERP_METHODS.TRACK_GROWTH_EXPERIMENT,
    ERP_METHODS.CREATE_GROWTH_EXPERIMENT,
  ],

  // ============================================
  // MARKETING (Phase 5)
  // ============================================
  marketing: [
    ERP_METHODS.GET_CAMPAIGN_PERFORMANCE,
    ERP_METHODS.CREATE_MARKETING_CAMPAIGN,
    ERP_METHODS.GET_AUDIENCE_SEGMENTS,
    ERP_METHODS.CREATE_AUDIENCE_SEGMENT,
    ERP_METHODS.GET_CONTENT_CALENDAR,
    ERP_METHODS.SCHEDULE_CONTENT,
    ERP_METHODS.GET_LEAD_ATTRIBUTION,
    ERP_METHODS.GET_BRAND_HEALTH_METRICS,
    ERP_METHODS.MANAGE_REVIEW_RESPONSE,
    ERP_METHODS.GET_COMPETITOR_INTELLIGENCE,
  ],
} as const;
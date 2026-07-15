export interface DeliveryAttemptDTO {
  channel: string;
  status: string;
  errorMessage: string | null;
  attemptedAt: string;
}

export interface NotificationDTO {
  id: number;
  userId: number;
  type: string;
  priority: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  attempts: DeliveryAttemptDTO[];
}

export interface NotificationPreferenceDTO {
  userId: number;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  minPriority: string;
}

export interface NotificationTemplateDTO {
  id: number | null;
  name: string;
  subject: string | null;
  bodyMarkdown: string;
  bodyHtml: string;
  version: number;
}

// ==============================
// ZapDesk Database Types
// ==============================

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string | null;
}

export interface Agent {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface Instance {
  id: string;
  workspace_id: string;
  name: string;
  phone_number: string | null;
  status: string;
  token: string | null;
  instance_id_external: string | null;
  qr_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InstanceWebhook {
  id: string;
  instance_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string | null;
  name: string;
  phone: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Tag {
  id: string;
  workspace_id: string | null;
  name: string;
  color: string;
  created_at: string | null;
}

export interface ContactTag {
  id: string;
  contact_id: string;
  tag_id: string;
}

export interface Conversation {
  id: string;
  workspace_id: string | null;
  customer_id: string;
  assigned_user_id: string | null;
  status: string;
  last_message_at: string | null;
  created_at: string;
  // Joined fields
  customer?: Contact;
  assigned_profile?: { name: string } | null;
  tags?: Tag[];
}

export interface Message {
  id: string;
  workspace_id: string | null;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  message_type: string;
  status: string;
  created_at: string;
}

export interface QuickReply {
  id: string;
  workspace_id: string | null;
  title: string;
  content: string;
  shortcut: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface BotConfig {
  id: string;
  workspace_id: string | null;
  is_active: boolean;
  welcome_message: string | null;
  steps: BotStep[] | null;
  created_at: string | null;
}

export interface BotStep {
  id: string;
  keywords: string;
  response: string;
  action: 'continue' | 'transfer';
}

export interface BotTrigger {
  id: string;
  bot_config_id: string;
  trigger_type: string;
  keyword: string | null;
  response: string | null;
  action: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Broadcast {
  id: string;
  workspace_id: string | null;
  name: string;
  message: string;
  status: string;
  contacts_count: number | null;
  total_recipients: number;
  total_sent: number;
  total_delivered: number;
  total_read: number;
  total_failed: number;
  sent_at: string | null;
  created_at: string | null;
}

export interface BroadcastRecipient {
  id: string;
  broadcast_id: string;
  contact_id: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  instance_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  processed: boolean;
  created_at: string;
}

export interface WebhookMessage {
  id: string;
  webhook_event_id: string | null;
  instance_id: string | null;
  from_number: string | null;
  to_number: string | null;
  message_text: string | null;
  message_type: string;
  direction: string;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface SendFolder {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ConversationBotState {
  id: string;
  conversation_id: string;
  bot_config_id: string | null;
  current_step: string | null;
  state: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

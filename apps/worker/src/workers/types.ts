export interface SearchJobData {
  searchId: string;
  userId: string;
  query: string;
  keywords: string[];
  location?: string;
}

export interface NotificationJobData {
  postId: string;
  userId: string | null;
  searchId: string | null;
  channel: "TELEGRAM" | "DISCORD" | "EMAIL" | "FIREBASE";
}

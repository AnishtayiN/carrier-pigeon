export interface User {
  id: string;
  name: string;
  avatar: string;
  lat: number;
  lng: number;
  city: string;
  connected: boolean;
}

export interface PigeonMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: string;
  deliveredAt?: string;
  status: "sending" | "inTransit" | "delivered" | "lost";
  senderLat: number;
  senderLng: number;
  receiverLat: number;
  receiverLng: number;
  currentLat: number;
  currentLng: number;
  distanceKm: number;
  speedKmh: number;
  progress: number;
}

export interface WSMessage {
  type: string;
  data?: any;
}

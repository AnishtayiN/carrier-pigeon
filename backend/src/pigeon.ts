import { PigeonMessage } from "./types";

const PIGEON_SPEED = 177; // km/h
const LOST_CHANCE = 0.002;
const SPEED_VARIANCE = 0.25;

export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createPigeonMessage(
  senderId: string,
  receiverId: string,
  content: string,
  senderLat: number,
  senderLng: number,
  receiverLat: number,
  receiverLng: number
): PigeonMessage {
  const distance = haversineDistance(senderLat, senderLng, receiverLat, receiverLng);
  const speedVariation = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;

  return {
    id: crypto.randomUUID(),
    senderId,
    receiverId,
    content,
    sentAt: new Date().toISOString(),
    status: "inTransit",
    senderLat,
    senderLng,
    receiverLat,
    receiverLng,
    currentLat: senderLat,
    currentLng: senderLng,
    distanceKm: distance,
    speedKmh: PIGEON_SPEED * speedVariation,
    progress: 0,
  };
}

export function updatePigeon(msg: PigeonMessage): PigeonMessage {
  if (msg.status !== "inTransit") return msg;

  // 0.2% chance to get lost per tick
  if (Math.random() < LOST_CHANCE) {
    msg.status = "lost";
    return msg;
  }

  const speedVariation = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
  const effectiveSpeed = msg.speedKmh * speedVariation;

  // Each tick = 2 seconds
  const increment = (effectiveSpeed / 3600) * 2 / (msg.distanceKm || 1);
  msg.progress = Math.min(1, msg.progress + increment);

  // Interpolate position
  msg.currentLat = msg.senderLat + (msg.receiverLat - msg.senderLat) * msg.progress;
  msg.currentLng = msg.senderLng + (msg.receiverLng - msg.senderLng) * msg.progress;

  // Slight curve
  const curve = Math.sin(msg.progress * Math.PI) * 0.05;
  msg.currentLat += curve;

  if (msg.progress >= 1) {
    msg.status = "delivered";
    msg.deliveredAt = new Date().toISOString();
    msg.currentLat = msg.receiverLat;
    msg.currentLng = msg.receiverLng;
  }

  return msg;
}

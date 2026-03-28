export interface Place {
  name: string;
  type: "food" | "cafe" | "attraction" | "hotel";
  lat: number;
  lng: number;
}

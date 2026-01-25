import mongoose, { Schema, model, Document } from "mongoose";

export interface UserData extends Document {
  firstName?: string;
  lastName?: string;
  email?: string;
  password: string; 
  number?: string;
  gender?:string;
  blocked?:Boolean;
  strikeCount?:number;
  playerId: string[];
  profileImage?: string;
  appId?: string[];
  document?:string[];
  documentVerified?:Boolean;
  userType?: "admin" | "user" | "business";
  restro_type: "Luxury" | "ordinary";
  dietary_prefernces?: string[];
  allergy?:string;
  location?: any;
  manual_location?: {
    city?: string;
    state?: string;
    country?: string;
    coordinates?: [number, number];
  };
  email_notification?: {
    booking_update: boolean;
    new_offer: boolean;
  };
  app_notification?: {
    booking_update: boolean;
    new_offer: boolean;
  };
  profile_status?: "under_review" | "rejected" |"verified";
  profile_step?:Boolean;
  business_type?: number;
  phone?:Number;
  staticFollowers?:Number;
  access_token?: string;
  name?: string;
  otp?:string;
  isVerified?:Boolean;
  otpExpires:Date;
  facebookId?: string;
  // Subscription fields
  currentSubscriptionId?: any; // Reference to active Subscription document
  hasActiveSubscription?: boolean; // Denormalized for faster queries
  subscriptionExpiryDate?: Date; // Denormalized for faster queries
  instagramId?: string;
  city?:string;
  isDeleted?:Boolean;
  instagram?: {
    id: string;
    username: string;
    instagramlink:string;
  } | null;
  businessDiscovery:{
    followers_count:Number;
    media_count:Number;
    nonfollowers: Number;
    nonFollowersWhoEngaged: Number;
    followersWhoEngaged:Number;
  }| null;
  insights?: {
    reach?: number;
    profile_views?: number;
    views?: number;
    content_views?: number;
    accounts_engaged?: number;
    engagementRate?: number;
  }|null;
  review:Boolean;
  address?:string;
  accessToken?:string;
  upi_Id?:string;
  lastTokenRefresh:Date;
  passwordChangedAt:Date;
}

// Schema for the user
const userSchema = new Schema<UserData>(
  {
    accessToken: {
      type: String,
      required: false,
    },
    firstName: {
      type: String,
      required: false,
    },
    lastName: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      unique: true,
      required: false,
    },
    gender: {
      type: String,
      required: false,
    },
    address:{
      type:String,
      required:false,
    },
    document: [
      {
        type: String,
      },
    ],
    documentVerified:{
      type:Boolean,
      default:false,
    },
    upi_Id:{
      type:String,
      required:false,
    },
    playerId: { type: [String], default: [] },
    phone:{
      type:String,
      required:false,
    },
    password: {
      type: String,
      required: false,
    },
    city:{
      type:String,
      required:false,
    },
    number: {
      type: String,
      required: false,
    },
    profileImage: {
      type: String,
      required: false,
    },
    appId: {
      type: [String],
      required: false,
    },
    userType: {
      type: String,
      enum: ["admin", "user", "business"],
      required: false,
    },
    dietary_prefernces: {
      type: [String],
      required: false,
    },
    allergy:{
      type:String,
      required:false,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
      address: {
        type: String,
      },
    },
    manual_location: {
      city: { type: String },
      state: { type: String },
      country: { type: String, default: "India" },
      coordinates: { type: [Number] },
    },
    email_notification: {
      type: {
        booking_update: { type: Boolean, default: false },
        new_offer: { type: Boolean, default: false },
      },
      required: false,
    },
    app_notification: {
      type: {
        booking_update: { type: Boolean, default: false },
        new_offer: { type: Boolean, default: false },
      },
      required: false,
    },
    profile_status: {
      type: String,
      enum: ["under_review", "rejected","verified"],
      default:"under_review",
    },
    profile_step: {
      type: Boolean,
      default:true,
      required: false,
    },
    business_type: {
      type: Number,
      required: false,
    },
    restro_type: {
      type: String,
      enum: ["luxury", "ordinary"],
      default: "ordinary",
    },
    access_token: {
      type: String,
      required: false,
    },
    name: {
      type: String,
      required: false,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpires: {
      type: Date,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    facebookId: {
      type: String,
      default: null,
    },
    // Subscription fields
    currentSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: false,
    },
    hasActiveSubscription: {
      type: Boolean,
      default: false,
      index: true,
    },
    subscriptionExpiryDate: {
      type: Date,
      required: false,
      index: true,
    },
    instagramId: {
      type: String,
      default: null,
    },
    instagram: {
      type: {
        id: { type: String },
        username: { type: String },
        instagramlink:{type:String},
      },
      default: null,
    },
    insights: {
      type: {
        reach: { type: Number, default: 0 },
        profile_views: { type: Number, default: 0 },
        views: { type: Number, default: 0 },
        content_views: { type: Number, default: 0 },
        accounts_engaged: { type: Number, default: 0 },
        engagementRate: { type: Number, default: 0 },
      },
      default: {},
    },
    businessDiscovery:{
      type: {
        followers_count: { type: Number,default:0 },
        media_count: { type: Number,default:0 },
        nonfollowers:{ type:Number,default:0 },
        followersWhoEngaged:{type:Number,default:0},
        nonFollowersWhoEngaged:{type:Number,default:0},
      },
      default: null,
    },
    strikeCount: {
      type: Number,
      default: 0,
    },
    blocked: {
      type: Boolean,
      default: false, 
    },
    isDeleted:{
      type:Boolean,
      default:false
    },
    staticFollowers:{
      type:Number,
      default:0,
    },
    lastTokenRefresh: {
      type: Date,
      default: null,
    },
     passwordChangedAt: {
      type: Date,
      default: null,
    },
    review:{
      type:Boolean,
      default:false
    },
  },
  {
    timestamps: true,
  }
);
userSchema.index({ "location.coordinates": "2dsphere" }, { background: true });
const UserModel = model<UserData>("users", userSchema);
export default UserModel;

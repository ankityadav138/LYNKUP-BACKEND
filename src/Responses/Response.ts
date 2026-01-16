import { Response } from "express";

export const resStatus = (res: Response, status: string, msg: string): Response => {
  return res.status(200).json({ message: msg, status });
};

export const resStatusData = (
  res: Response,
  status: string,
  msg: string,
  data: unknown
): Response => {
  return res.status(200).json({ message: msg, data, status });
};
export const responsestatusmessage = (
  res: Response,
  status: String,
  message: String
) => {
  return res.status(200).send({ status: status, message: message });
};

export const resStatusDataToken = (
  res: Response,
  status: string,
  msg: string,
  data: unknown,
  token: string
): Response => {
  return res.status(200).json({ message: msg, token, data, status });
};

export const resStatusToken = (
  res: Response,
  status: string,
  msg: string,
  token: string
): Response => {
  return res.status(200).json({ message: msg, token, status });
};

export const resStatusTryCatch = (
  res: Response,
  status: string,
  msg: string
): Response => {
  return res.status(500).json({ message: msg, status });
};

export const resStatus401 = (
  res: Response,
  status: string,
  msg: string
): Response => {
  return res.status(401).json({ message: msg, status });
};

export const resStatus403 = (
  res: Response,
  status: string,
  msg: string
): Response => {
  return res.status(403).json({ message: msg, status });
};

export const resStatus404 = (
  res: Response,
  status: string,
  msg: string
): Response => {
  return res.status(404).json({ message: msg, status });
};

export const resStatusDataToken201 = (
  res: Response,
  status: string,
  msg: string,
  data: unknown,
  token: string
): Response => {
  return res.status(201).json({ message: msg, token, data, status });
};

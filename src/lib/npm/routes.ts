export const ROUTE_TRANSITION_KEY = "npm-downloads:route-transition";

export function encodePackagePath(packageName: string) {
  return encodeURIComponent(packageName);
}

export function decodePackageParam(value: string) {
  return decodeURIComponent(value);
}

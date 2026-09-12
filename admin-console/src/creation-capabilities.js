// UI capability hints mirror the server check; never infer file support from chat support.
export function supportsCreationMethod(model, jobType) {
  return Array.isArray(model?.capabilities) && model.capabilities.includes(jobType);
}

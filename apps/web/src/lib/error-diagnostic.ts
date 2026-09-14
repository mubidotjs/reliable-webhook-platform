export function errorDiagnostic(error: unknown) {
  const value = error instanceof Error ? error : null;
  const knownTypes = [
    "PrismaClientKnownRequestError",
    "PrismaClientUnknownRequestError",
    "PrismaClientInitializationError",
    "PrismaClientValidationError",
    "ZodError",
  ];
  const candidate = value && "code" in value ? value.code : undefined;
  return {
    errorType:
      value && knownTypes.includes(value.name) ? value.name : "UnexpectedError",
    errorCode:
      typeof candidate === "string" && /^P\d{4}$/.test(candidate)
        ? candidate
        : undefined,
  };
}

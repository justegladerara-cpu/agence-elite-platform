export function aPermission(membre, permission, modulesActives = []) {
  if (!membre?.actif || !modulesActives.includes(permission.split('.')[0])) return false;
  if (Object.hasOwn(membre.permissionsAjustees ?? {}, permission)) return membre.permissionsAjustees[permission] === true;
  return (membre.permissions ?? []).includes(permission);
}

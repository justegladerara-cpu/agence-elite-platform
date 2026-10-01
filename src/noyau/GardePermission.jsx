import React from 'react';
import { aPermission } from './permissions.js';
export function GardePermission({ membre, permission, modulesActives, children, sinon = null }) {
  return aPermission(membre, permission, modulesActives) ? children : sinon;
}

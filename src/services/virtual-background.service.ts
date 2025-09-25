import { Role } from '../types';

interface RoleBackground {
  roleId: string;
  backgroundId: string;
}

export class VirtualBackgroundService {
  private roleBackgrounds: Map<string, string> = new Map();
  private roles: Set<string> = new Set(['123']); // Mock roles
  private backgrounds: Set<string> = new Set(['bg-123']); // Mock backgrounds

  async setDefaultBackgroundForRole(roleId: string, backgroundId: string): Promise<RoleBackground> {
    if (!this.roles.has(roleId)) {
      throw new Error('Role not found');
    }
    if (!this.backgrounds.has(backgroundId)) {
      throw new Error('Background not found'); 
    }

    this.roleBackgrounds.set(roleId, backgroundId);

    return {
      roleId,
      backgroundId
    };
  }

  async getDefaultBackgroundForRole(roleId: string): Promise<RoleBackground | null> {
    const backgroundId = this.roleBackgrounds.get(roleId);
    if (!backgroundId) {
      return null;
    }

    return {
      roleId,
      backgroundId
    };
  }
}
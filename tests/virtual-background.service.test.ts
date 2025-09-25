import { VirtualBackgroundService } from '../src/services/virtual-background.service';
import { Role } from '../src/types';

describe('VirtualBackgroundService', () => {
  let service: VirtualBackgroundService;

  beforeEach(() => {
    service = new VirtualBackgroundService();
  });

  describe('setDefaultBackgroundForRole', () => {
    it('should set default background for a role', async () => {
      const role: Role = {
        id: '123',
        name: 'Doctor'
      };
      const backgroundId = 'bg-123';
      
      const result = await service.setDefaultBackgroundForRole(role.id, backgroundId);
      
      expect(result).toBeDefined();
      expect(result.roleId).toBe(role.id);
      expect(result.backgroundId).toBe(backgroundId);
    });

    it('should throw error if role not found', async () => {
      const invalidRoleId = 'invalid-123';
      const backgroundId = 'bg-123';

      await expect(
        service.setDefaultBackgroundForRole(invalidRoleId, backgroundId)
      ).rejects.toThrow('Role not found');
    });

    it('should throw error if background not found', async () => {
      const roleId = '123';
      const invalidBackgroundId = 'invalid-bg';

      await expect(
        service.setDefaultBackgroundForRole(roleId, invalidBackgroundId) 
      ).rejects.toThrow('Background not found');
    });
  });

  describe('getDefaultBackgroundForRole', () => {
    it('should get default background for a role', async () => {
      const roleId = '123';
      const backgroundId = 'bg-123';

      // First set default background
      await service.setDefaultBackgroundForRole(roleId, backgroundId);
      
      const result = await service.getDefaultBackgroundForRole(roleId);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.roleId).toBe(roleId);
        expect(result.backgroundId).toBe(backgroundId);
      }
    });

    it('should return null if no default set for role', async () => {
      const roleId = '123';
      
      const result = await service.getDefaultBackgroundForRole(roleId);
      
      expect(result).toBeNull();
    });
  });
});
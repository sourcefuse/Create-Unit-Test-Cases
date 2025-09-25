"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VirtualBackgroundService = void 0;
class VirtualBackgroundService {
    constructor() {
        this.roleBackgrounds = new Map();
        this.roles = new Set(['123']); // Mock roles
        this.backgrounds = new Set(['bg-123']); // Mock backgrounds
    }
    async setDefaultBackgroundForRole(roleId, backgroundId) {
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
    async getDefaultBackgroundForRole(roleId) {
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
exports.VirtualBackgroundService = VirtualBackgroundService;

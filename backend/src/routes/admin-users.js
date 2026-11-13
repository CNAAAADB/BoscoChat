import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';
import { ROLES } from '../users/roles.js';

export function createAdminUsersRouter(authService, administrationService, { passwordResets = null } = {}) {
  const router = express.Router();
  router.use(requireAuthorization(authService, new Set([ROLES.ADMINISTRATOR])));

  router.get('/', async (req, res, next) => {
    try { res.json({ users: await administrationService.listUsers() }); } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      res.status(201).json({ user: await administrationService.createUser(req.user.id, req.body ?? {}) });
    } catch (error) { next(error); }
  });

  router.patch('/:userId/role', async (req, res, next) => {
    try {
      res.json({ user: await administrationService.changeRole(req.user.id, req.params.userId, req.body?.role) });
    } catch (error) { next(error); }
  });

  router.patch('/:userId/suspension', async (req, res, next) => {
    try {
      res.json({ user: await administrationService.setSuspended(req.user.id, req.params.userId, req.body?.suspended) });
    } catch (error) { next(error); }
  });

  if (passwordResets) {
    router.post('/:userId/password-reset', async (req, res, next) => {
      try {
        const reset = await passwordResets.issueByAdministrator(req.user.id, req.params.userId);
        res.set('Cache-Control', 'no-store');
        res.status(201).json({ reset });
      } catch (error) { next(error); }
    });
  }

  router.delete('/:userId', async (req, res, next) => {
    try {
      await administrationService.deleteUser(req.user.id, req.params.userId);
      res.status(204).send();
    } catch (error) { next(error); }
  });

  return router;
}

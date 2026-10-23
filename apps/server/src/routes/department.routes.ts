import { Router } from 'express'
import * as departments from '../controllers/department.controller.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const departmentRouter = Router()

departmentRouter.use(authenticate)
departmentRouter.get('/', departments.list)
departmentRouter.post('/', authorize('ADMIN'), departments.create)
departmentRouter.patch('/:id', authorize('ADMIN'), departments.update)
departmentRouter.delete('/:id', authorize('ADMIN'), departments.remove)

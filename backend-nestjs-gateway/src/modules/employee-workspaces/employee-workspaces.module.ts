import { Module } from '@nestjs/common';
import { EmployeeWorkspacesController } from './employee-workspaces.controller';
import { EmployeeWorkspacesService } from './employee-workspaces.service';

@Module({ controllers: [EmployeeWorkspacesController], providers: [EmployeeWorkspacesService] })
export class EmployeeWorkspacesModule {}

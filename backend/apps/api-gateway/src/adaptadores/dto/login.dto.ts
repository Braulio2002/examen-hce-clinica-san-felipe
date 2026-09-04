import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * CAPA 3 · ADAPTADORES — Contrato de entrada del inicio de sesion.
 *
 * Valida unicamente la forma. La comprobacion de la credencial ocurre en
 * ms-auth, y sus mensajes de error son deliberadamente identicos tanto si el
 * usuario no existe como si la contrasena es incorrecta: distinguirlos permitiria
 * enumerar cuentas validas.
 */

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Nombre de usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El usuario es obligatorio.' })
  @MaxLength(50)
  username!: string;

  @ApiProperty({ example: 'Admin123$', description: 'Contrasena del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'La contrasena es obligatoria.' })
  @MinLength(6, { message: 'La contrasena debe tener al menos 6 caracteres.' })
  @MaxLength(128)
  password!: string;
}

export class RespuestaLoginDto {
  @ApiProperty({ description: 'Token JWT. Tambien se envia como cookie HttpOnly.' })
  accessToken!: string;

  @ApiProperty({ description: 'Vigencia del token en segundos', example: 1800 })
  expiraEnSegundos!: number;

  @ApiProperty({
    description: 'Perfil publico del usuario autenticado',
    example: { id: 1, username: 'admin', nombreCompleto: 'Administrador', rol: 'ADMIN' },
  })
  usuario!: {
    id: number;
    username: string;
    nombreCompleto: string;
    rol: string;
  };
}

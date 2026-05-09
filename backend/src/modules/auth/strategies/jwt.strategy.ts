import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserSessionService } from '../user-session.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly userSessionService: UserSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret'),
      passReqToCallback: true,  // 让 validate 能拿到原始 request
    });
  }

  async validate(req: any, payload: any) {
    // 从 Authorization header 提取原始 token
    const rawToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    // 验证会话是否存在且有效
    const isValid = await this.userSessionService.validateAccessToken(payload.sub, rawToken);
    if (!isValid) {
      throw new UnauthorizedException('令牌已失效，请重新登录');
    }

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      status: 'active',
    };
  }
}
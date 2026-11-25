# The Bazaar's integrations hub (ASP.NET Core + Blazor). Built from the
# repository root's compose file, which passes in the Next.js app as the
# "frontend" context and clients/brand as "brandkit" so the hub shares the
# shop's tokens, logo, wallpaper and map script.

FROM --platform=$BUILDPLATFORM python:3.13-slim AS brand
COPY --from=brandkit . /kit/
COPY --from=frontend src/app/globals.css /fe/src/app/globals.css
COPY --from=frontend src/components/guest-frame.tsx /fe/src/components/guest-frame.tsx
COPY --from=frontend public/img /fe/public/img
RUN python -I /kit/build_brand.py /fe /brand

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src
COPY src/Bazaar.Api/Bazaar.Api.csproj src/Bazaar.Api/
COPY src/Bazaar.Hub/Bazaar.Hub.csproj src/Bazaar.Hub/
RUN dotnet restore src/Bazaar.Hub/Bazaar.Hub.csproj -a $TARGETARCH
COPY src/ src/
COPY --from=brand /brand src/Bazaar.Hub/wwwroot/brand
RUN dotnet publish src/Bazaar.Hub/Bazaar.Hub.csproj -c Release -a $TARGETARCH --no-restore -o /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true \
    DOTNET_NOLOGO=1 \
    Hub__KeysDir=/keys
WORKDIR /app
COPY --from=build --chown=root:root /out ./
# The image's built-in non-root user (uid 1654). /keys is a volume it owns.
RUN mkdir -p /keys && chown $APP_UID /keys
USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/hub/healthz >/dev/null || exit 1
ENTRYPOINT ["dotnet", "Bazaar.Hub.dll"]

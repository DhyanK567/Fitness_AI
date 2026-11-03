from pathlib import Path

from setuptools import find_namespace_packages, setup


APP_ROOT = Path(__file__).resolve().parent
PACKAGE_SOURCE = Path("wellness_studio") / "wellness_studio"
PACKAGE_ROOT = APP_ROOT / PACKAGE_SOURCE
with (APP_ROOT / "requirements.txt").open(encoding="utf-8") as f:
    install_requires = [line.strip() for line in f if line.strip() and not line.lstrip().startswith("#")]

subpackages = find_namespace_packages(where=str(PACKAGE_ROOT))
packages = ["wellness_studio", *[f"wellness_studio.{name}" for name in subpackages]]

setup(
    name="wellness_studio",
    version="0.0.1",
    description="Wellness Studio OS - Universal multi-tenant wellness studio management system",
    author="Wellness Studio OS Team",
    author_email="",
    license="MIT",
    python_requires=">=3.10",
    packages=packages,
    package_dir={"wellness_studio": PACKAGE_SOURCE.as_posix()},
    package_data={"": ["*.json", "*.txt"]},
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)

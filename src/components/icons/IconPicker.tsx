"use client";

import { useState, useMemo, Fragment } from "react";
import { Dialog, Transition, Tab } from "@headlessui/react";
import * as HeroiconsOutline from "@heroicons/react/24/outline";
import * as HeroiconsSolid from "@heroicons/react/24/solid";
import { library, IconName, IconPrefix } from "@fortawesome/fontawesome-svg-core";
import { fas } from "@fortawesome/free-solid-svg-icons";
import { far } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

library.add(fas, far);

export interface IconSelection {
  library: "heroicons" | "fontawesome";
  name: string;
  variant: "outline" | "solid" | "regular";
}

interface IconPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (icon: IconSelection) => void;
}

const heroiconNames = Object.keys(HeroiconsOutline).filter(
  (key) => key.endsWith("Icon") && key !== "Icon"
);

const fontAwesomeSolidIcons = Object.keys(fas).filter((key) => key.startsWith("fa"));
const fontAwesomeRegularIcons = Object.keys(far).filter((key) => key.startsWith("fa"));

function toKebabCase(str: string): string {
  return str
    .replace(/Icon$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function faIconNameToKebab(name: string): string {
  return name.replace(/^fa/, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export default function IconPicker({ isOpen, onClose, onSelect }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [heroVariant, setHeroVariant] = useState<"outline" | "solid">("outline");
  const [faVariant, setFaVariant] = useState<"solid" | "regular">("solid");

  const filteredHeroicons = useMemo(() => {
    const searchLower = search.toLowerCase();
    return heroiconNames.filter((name) =>
      toKebabCase(name).includes(searchLower) || name.toLowerCase().includes(searchLower)
    );
  }, [search]);

  const filteredFaIcons = useMemo(() => {
    const searchLower = search.toLowerCase();
    const icons = faVariant === "solid" ? fontAwesomeSolidIcons : fontAwesomeRegularIcons;
    return icons.filter((name) =>
      faIconNameToKebab(name).includes(searchLower) || name.toLowerCase().includes(searchLower)
    );
  }, [search, faVariant]);

  function handleSelectHeroicon(name: string) {
    onSelect({
      library: "heroicons",
      name: toKebabCase(name),
      variant: heroVariant,
    });
    onClose();
  }

  function handleSelectFaIcon(name: string) {
    onSelect({
      library: "fontawesome",
      name: faIconNameToKebab(name),
      variant: faVariant,
    });
    onClose();
  }

  function renderHeroicon(name: string) {
    const icons = heroVariant === "outline" ? HeroiconsOutline : HeroiconsSolid;
    const IconComponent = icons[name as keyof typeof icons];
    if (!IconComponent) return null;
    return <IconComponent className="w-6 h-6" />;
  }

  function renderFaIcon(name: string) {
    const prefix: IconPrefix = faVariant === "solid" ? "fas" : "far";
    const iconName = faIconNameToKebab(name) as IconName;
    return <FontAwesomeIcon icon={[prefix, iconName]} className="w-6 h-6" />;
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-surface shadow-xl transition-all">
                <Dialog.Title className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <span className="font-medium text-gray-900">Select Icon</span>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  >
                    &times;
                  </button>
                </Dialog.Title>

                <div className="p-4">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search icons..."
                    className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />

                  <Tab.Group>
                    <Tab.List className="flex border-b border-gray-200 mb-4">
                      <Tab
                        className={({ selected }) =>
                          `flex-1 py-2.5 text-sm font-medium focus:outline-none ${
                            selected
                              ? "text-brand-600 border-b-2 border-brand-600"
                              : "text-gray-500 hover:text-gray-700"
                          }`
                        }
                      >
                        Heroicons
                      </Tab>
                      <Tab
                        className={({ selected }) =>
                          `flex-1 py-2.5 text-sm font-medium focus:outline-none ${
                            selected
                              ? "text-brand-600 border-b-2 border-brand-600"
                              : "text-gray-500 hover:text-gray-700"
                          }`
                        }
                      >
                        FontAwesome
                      </Tab>
                    </Tab.List>

                    <Tab.Panels>
                      <Tab.Panel>
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={() => setHeroVariant("outline")}
                            className={`px-3 py-1 text-sm rounded-md ${
                              heroVariant === "outline"
                                ? "bg-brand-100 text-brand-700"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            Outline
                          </button>
                          <button
                            onClick={() => setHeroVariant("solid")}
                            className={`px-3 py-1 text-sm rounded-md ${
                              heroVariant === "solid"
                                ? "bg-brand-100 text-brand-700"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            Solid
                          </button>
                        </div>

                        <div className="grid grid-cols-8 gap-2 max-h-80 overflow-y-auto">
                          {filteredHeroicons.slice(0, 200).map((name) => (
                            <button
                              key={name}
                              onClick={() => handleSelectHeroicon(name)}
                              title={toKebabCase(name)}
                              className="p-3 rounded-lg border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors flex items-center justify-center"
                            >
                              {renderHeroicon(name)}
                            </button>
                          ))}
                        </div>
                        {filteredHeroicons.length > 200 && (
                          <p className="mt-2 text-sm text-gray-500 text-center">
                            Showing first 200 results. Refine your search to see more.
                          </p>
                        )}
                      </Tab.Panel>

                      <Tab.Panel>
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={() => setFaVariant("solid")}
                            className={`px-3 py-1 text-sm rounded-md ${
                              faVariant === "solid"
                                ? "bg-brand-100 text-brand-700"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            Solid
                          </button>
                          <button
                            onClick={() => setFaVariant("regular")}
                            className={`px-3 py-1 text-sm rounded-md ${
                              faVariant === "regular"
                                ? "bg-brand-100 text-brand-700"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            Regular
                          </button>
                        </div>

                        <div className="grid grid-cols-8 gap-2 max-h-80 overflow-y-auto">
                          {filteredFaIcons.slice(0, 200).map((name) => (
                            <button
                              key={name}
                              onClick={() => handleSelectFaIcon(name)}
                              title={faIconNameToKebab(name)}
                              className="p-3 rounded-lg border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors flex items-center justify-center"
                            >
                              {renderFaIcon(name)}
                            </button>
                          ))}
                        </div>
                        {filteredFaIcons.length > 200 && (
                          <p className="mt-2 text-sm text-gray-500 text-center">
                            Showing first 200 results. Refine your search to see more.
                          </p>
                        )}
                      </Tab.Panel>
                    </Tab.Panels>
                  </Tab.Group>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
